import { useEffect, useRef, useState } from 'react';
import { validateProject } from './editor-core.js';

const DB_NAME = 'blueprint-studio-db';
const CURRENT_KEY = 'blueprint-studio-current-v1';
let writeQueue = Promise.resolve();
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('app')) request.result.createObjectStore('app');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readProjects() {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('app').objectStore('app').get('projects');
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export function persistProjects(list) {
  const snapshot = structuredClone(list);
  const operation = writeQueue
    .catch(() => {})
    .then(async () => {
      const db = await openDB();
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('app', 'readwrite');
          tx.objectStore('app').put(snapshot, 'projects');
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Save interrupted'));
        });
      } finally {
        db.close();
      }
    });
  writeQueue = operation;
  return operation;
}
export function useProjectStore(makeEmpty) {
  const [project, setActiveState] = useState(makeEmpty);
  const [projects, setListState] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Opening projects…');
  const projectRef = useRef(project),
    listRef = useRef([]),
    ready = useRef(false),
    failedLoad = useRef(false),
    revision = useRef(0),
    persistedRevision = useRef(0);

  const setProjects = (fn) => {
    const next = typeof fn === 'function' ? fn(listRef.current) : fn;
    listRef.current = next;
    setListState(next);
    revision.current += 1;
    setSaveStatus('Saving…');
  };
  const setProject = (fn) => {
    const next = typeof fn === 'function' ? fn(projectRef.current) : fn;
    projectRef.current = next;
    setActiveState(next);
    setProjects(
      [...listRef.current.filter((p) => p.id !== next.id), next].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    );
    try {
      localStorage.setItem(CURRENT_KEY, next.id);
    } catch {
      /* IndexedDB remains the authoritative project store. */
    }
  };
  const flush = async () => {
    if (!ready.current || failedLoad.current || revision.current === persistedRevision.current)
      return;
    const thisRevision = revision.current;
    try {
      await persistProjects(listRef.current);
      persistedRevision.current = thisRevision;
      if (thisRevision === revision.current) setSaveStatus('Saved in this browser');
    } catch {
      setSaveStatus('Save failed · download a backup');
    }
  };

  useEffect(() => {
    let alive = true;
    readProjects()
      .then((list) => {
        if (!alive) return;
        // Validate all records before writing: never silently overwrite a damaged archive.
        const validated = list.map(validateProject);
        let id;
        try {
          id = localStorage.getItem(CURRENT_KEY);
        } catch {
          /* unavailable */
        }
        const current = validated.find((p) => p.id === id) || validated[0] || projectRef.current;
        listRef.current = validated.length ? validated : [current];
        projectRef.current = current;
        setActiveState(current);
        setListState(listRef.current);
        ready.current = true;
        setHydrated(true);
        setSaveStatus('Saved in this browser');
      })
      .catch(() => {
        if (!alive) return;
        failedLoad.current = true;
        ready.current = true;
        setHydrated(true);
        setSaveStatus('Storage unavailable · download backups');
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (failedLoad.current) {
      setSaveStatus('Storage unavailable · download backups');
      return;
    }
    const timer = setTimeout(flush, 200);
    return () => clearTimeout(timer);
  }, [projects, hydrated]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onLeave = (e) => {
      if (revision.current !== persistedRevision.current) {
        void flush();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onLeave);
      void flush();
    };
  }, []);
  return { project, projects, setProject, setProjects, hydrated, saveStatus, projectRef };
}
