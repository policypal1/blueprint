import { useEffect, useRef, useState } from 'react';
import { validateProject } from './editor-core.js';
import { useAccountProjects } from './useAccountProjects.js';

const DB_NAME = 'blueprint-studio-db';
const CURRENT_KEY = 'blueprint-studio-current-v1';
let writeQueue = Promise.resolve();

const projectListKey = (owner) => owner ? `projects:${owner}` : 'projects';
const currentProjectKey = (owner) => owner ? `${CURRENT_KEY}:${owner}` : CURRENT_KEY;

export function openDB() {
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
        update(tx.objectStore('app'), projectListKey(owner), (error) => {
          tx.abort();
          reject(error);
        });
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

const storageVersion = (record) => record.storageRevision ?? record.updatedAt ?? null;

async function saveLocalChanges(owner, baseline, list) {
  const next = new Map(list.map(p => [p.id, p]));
  const changed = new Set([...baseline.keys(), ...next.keys()].filter(id =>
    baseline.get(id)?.project !== next.get(id)));
  if (!changed.size) return baseline;
  const version = crypto.randomUUID();
  await writeProjects(owner, (store, key, abort) => {
    const read = store.get(key);
    read.onsuccess = () => {
      if (read.result !== undefined && !Array.isArray(read.result)) {
        abort(new Error('Could not read the saved project list.'));
        return;
      }
      const saved = new Map((read.result ?? []).map(p => [p.id, p]));
      for (const id of changed) {
        const record = saved.get(id);
        // Compare only the plans touched by this tab, inside the write transaction.
        if (saved.has(id) !== baseline.has(id) || (record && storageVersion(record) !== baseline.get(id).version)) {
          abort(new Error('Plan changed in another tab'));
          return;
        }
        if (next.has(id)) saved.set(id, { ...next.get(id), storageRevision: version });
        else saved.delete(id);
      }
      store.put([...saved.values()], key);
    };
  });
  return new Map(list.map(project => [project.id, {
    project, version: changed.has(project.id) ? version : baseline.get(project.id).version,
  }]));
}

export async function removeDeviceProjects(owner) {
  if (!owner) return;
  await writeProjects(owner, (store, key) => store.delete(key));
  localStorage.removeItem(currentProjectKey(owner));
}

export function useProjectStore(makeEmpty, repository, showRecent, owner, memoryOnly = false) {
  const cloud = useAccountProjects(memoryOnly ? null : repository, showRecent);
  const [project, setActiveState] = useState(makeEmpty);
  const [projects, setListState] = useState([]);
  const [hydrated, setHydrated] = useState(memoryOnly);
  const [saveStatus, setSaveStatus] = useState(memoryOnly ? 'Preview only' : 'Opening projects…');
  const [accountId, setAccountId] = useState(null);
  const accountIdRef = useRef(null);
  const projectRef = useRef(project),
    listRef = useRef([]),
    ready = useRef(false),
    failedLoad = useRef(false),
    revision = useRef(0),
    persistedRevision = useRef(0);
  const baseline = useRef(new Map());
  const saving = useRef(Promise.resolve(true));

  const setProjects = (fn) => {
    if (memoryOnly) return;
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
    if (memoryOnly || nextAccountId) return;
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
    if (memoryOnly) return;
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
    const list = listRef.current;
    saving.current = saving.current.then(async () => {
      if (thisRevision <= persistedRevision.current) return true;
      try {
        baseline.current = await saveLocalChanges(owner, baseline.current, list);
        persistedRevision.current = thisRevision;
        if (thisRevision === revision.current) setSaveStatus('Saved in this browser');
        return true;
      } catch (error) {
        setSaveStatus(error.message === 'Plan changed in another tab'
          ? 'Plan changed in another tab · download a backup before reopening'
          : 'Save failed · download a backup');
        return false;
      }
    });
    return saving.current;
  };

  useEffect(() => {
    if (memoryOnly) return;
    let alive = true;
    // Older unassigned drafts stay on the device. We cannot infer their owner.
    readProjects(owner)
      .then((list) => {
        if (!alive) return;
        // Validate all records before writing: never silently overwrite a damaged archive.
        const validated = list.map(validateProject);
        baseline.current = new Map(validated.map((project, i) => [project.id, {
          project, version: storageVersion(list[i]),
        }]));
        validated.sort((a, b) => b.updatedAt - a.updatedAt);
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
    if (!hydrated || memoryOnly) return;
    if (failedLoad.current) {
      setSaveStatus('Storage unavailable · download backups');
      return;
    }
    const timer = setTimeout(flush, 200);
    return () => clearTimeout(timer);
  }, [projects, hydrated]);

  useEffect(() => {
    if (memoryOnly) return;
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
