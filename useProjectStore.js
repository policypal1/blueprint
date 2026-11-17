import { useEffect, useRef, useState } from 'react';
import { validateProject } from './editor-core.js';
import { useAccountProjects } from './useAccountProjects.js';

const DB_NAME = 'blueprint-studio-db';
const CURRENT_KEY = 'blueprint-studio-current-v1';
let writeQueue = Promise.resolve();

const projectListKey = (owner) => owner ? `projects:${owner}` : 'projects';
const currentProjectKey = (owner) => owner ? `${CURRENT_KEY}:${owner}` : CURRENT_KEY;

export function hasOpenedPlan() {
  try {
    return Boolean(localStorage.getItem(CURRENT_KEY));
  } catch {
    return false;
  }
}
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
export async function readProjects(owner) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('app').objectStore('app').get(projectListKey(owner));
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
function writeProjects(owner, update) {
  const operation = writeQueue.catch(() => {}).then(async () => {
    const db = await openDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('app', 'readwrite');
        update(tx.objectStore('app'), projectListKey(owner));
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

export function persistProjects(list, owner) {
  const snapshot = structuredClone(list);
  return writeProjects(owner, (store, key) => store.put(snapshot, key));
}

export async function removeDeviceProjects(owner) {
  if (!owner) return;
  await writeProjects(owner, (store, key) => store.delete(key));
  localStorage.removeItem(currentProjectKey(owner));
}

export function useProjectStore(makeEmpty, repository, showRecent, owner) {
  const cloud = useAccountProjects(repository, showRecent);
  const [project, setActiveState] = useState(makeEmpty);
  const [projects, setListState] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Opening projects…');
  const [accountId, setAccountId] = useState(null);
  const accountIdRef = useRef(null);
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
  const selectProject = (next, nextAccountId = null) => {
    accountIdRef.current = nextAccountId;
    setAccountId(nextAccountId);
    projectRef.current = next;
    setActiveState(next);
    if (nextAccountId) return;
    try {
      localStorage.setItem(currentProjectKey(owner), next.id);
    } catch {
      /* IndexedDB remains the authoritative project store. */
    }
  };

  const addLocalProject = (next) => {
    selectProject(next);
    setProjects(
      [...listRef.current.filter((p) => p.id !== next.id), next].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    );
  };
  const setProject = (fn) => {
    const next = typeof fn === 'function' ? fn(projectRef.current) : fn;
    const id = accountIdRef.current;
    if (id) {
      projectRef.current = next;
      setActiveState(next);
      cloud.edit(id, next);
    } else {
      addLocalProject(next);
    }
  };
  const flush = async () => {
    if (revision.current === persistedRevision.current) return true;
    if (!ready.current || failedLoad.current) return false;
    const thisRevision = revision.current;
    try {
      await persistProjects(listRef.current, owner);
      persistedRevision.current = thisRevision;
      if (thisRevision === revision.current) setSaveStatus('Saved in this browser');
      return true;
    } catch {
      setSaveStatus('Save failed · download a backup');
      return false;
    }
  };

  useEffect(() => {
    let alive = true;
    // Older unassigned drafts stay on the device. We cannot infer their owner.
    readProjects(owner)
      .then((list) => {
        if (!alive) return;
        // Validate all records before writing: never silently overwrite a damaged archive.
        const validated = list.map(validateProject).sort((a, b) => b.updatedAt - a.updatedAt);
        let id;
        try {
          id = localStorage.getItem(currentProjectKey(owner));
        } catch {
          /* unavailable */
        }
        const current = validated.find((p) => p.id === id) || validated[0] || projectRef.current;
        listRef.current = validated;
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
      if (document.visibilityState === 'hidden') {
        void flush();
        if (cloud.dirty()) void cloud.flush();
      }
    };
    const onLeave = (e) => {
      if (revision.current !== persistedRevision.current || cloud.dirty()) {
        void flush();
        if (cloud.dirty()) void cloud.flush();
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
  return {
    project, projects, setProject, addLocalProject, selectProject, setProjects,
    hydrated, saveStatus, projectRef, cloud, accountId, accountIdRef, flush,
  };
}
