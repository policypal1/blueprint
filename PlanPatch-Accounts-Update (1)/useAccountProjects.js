import { useEffect, useReducer, useRef, useState } from 'react';

const SAVE_DELAY = 850;

function draft(project, record, saved = null) {
  return { project, record, saved, attempt: null, writing: null, removing: false, error: null, timer: null };
}

export function useAccountProjects(repository, showRecent) {
  const [list, setList] = useState([]);
  const [listStatus, setListStatus] = useState('loading');
  const [, changed] = useReducer((count) => count + 1, 0);
  const entries = useRef(new Map());
  const newIds = useRef(new Map());
  const mounted = useRef(false);
  const listRequest = useRef(0);
  const notify = () => { if (mounted.current) changed(); };

  const refresh = async () => {
    if (!repository) return;
    const request = ++listRequest.current;
    setListStatus('loading');
    try {
      const plans = await repository.list();
      if (mounted.current && request === listRequest.current) {
        setList(plans);
        setListStatus('ready');
      }
    } catch {
      if (mounted.current && request === listRequest.current) setListStatus('error');
    }
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      listRequest.current += 1;
      entries.current.forEach((entry) => clearTimeout(entry.timer));
    };
  }, []);

  useEffect(() => {
    if (showRecent) void refresh();
  }, [repository, showRecent]);

  const write = (entry) => {
    clearTimeout(entry.timer);
    if (entry.writing) return entry.writing;
    if (entry.removing || entry.error?.name === 'ProjectConflict') return false;
    if (entry.project === entry.saved) return true;
    if (!mounted.current) return false;

    // A retry uses the same write ID, including when its response was lost after commit.
    const attempt = entry.attempt ??= { project: entry.project, id: crypto.randomUUID() };
    entry.writing = (async () => {
      try {
        entry.record = await repository.save(attempt.project, entry.record, entry.saved, attempt.id);
        entry.saved = attempt.project;
        entry.attempt = null;
        entry.error = null;
        return true;
      } catch (error) {
        entry.error = error;
        return false;
      } finally {
        entry.writing = null;
        notify();
      }
    })();
    notify();
    return entry.writing;
  };

  const save = async (entry) => {
    while (entry.project !== entry.saved) {
      if (!(await write(entry))) return false;
    }
    return true;
  };

  const edit = (id, project) => {
    const entry = entries.current.get(id);
    if (!entry || entry.project === project) return;
    entry.project = project;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => void save(entry), SAVE_DELAY);
    notify();
  };

  const open = async (id) => {
    const cached = entries.current.get(id);
    if (cached && (cached.project !== cached.saved || cached.removing)) return cached.project;
    const { project, record } = await repository.open(id);
    entries.current.set(id, draft(project, record, project));
    return project;
  };

  const saveNew = async (project, replacedId = null) => {
    const key = replacedId ? `copy:${replacedId}` : `local:${project.id}`;
    let id = newIds.current.get(key);
    if (!id) {
      id = crypto.randomUUID();
      newIds.current.set(key, id);
    }
    if (replacedId) project = { ...project, name: `${project.name.slice(0, 93)} (copy)` };
    const entry = entries.current.get(id) ?? draft(project, { id, revision: 0 });
    entries.current.set(id, entry);
    entry.project = project;
    if (!(await save(entry))) return null;
    newIds.current.delete(key);
    setList((plans) => [
      { id, name: entry.project.name, updatedAt: entry.project.updatedAt },
      ...plans.filter((plan) => plan.id !== id),
    ]);
    return { id, project: entry.project };
  };

  const dropDraft = (id) => {
    clearTimeout(entries.current.get(id)?.timer);
    entries.current.delete(id);
  };

  const remove = async (id) => {
    const entry = entries.current.get(id);
    clearTimeout(entry.timer);
    entry.removing = true;
    try {
      await entry.writing;
      await repository.remove(entry.record);
      entries.current.delete(id);
      setList((plans) => plans.filter((plan) => plan.id !== id));
    } finally {
      entry.removing = false;
      notify();
    }
  };

  const activeEntries = () => [...entries.current.values()].filter((entry) => entry.record.revision > 0);
  const flush = async () => {
    await Promise.all([...entries.current.values()].map((entry) => entry.writing));
    return (await Promise.all(activeEntries().map(save))).every(Boolean);
  };

  return {
    list: [...list, ...activeEntries().filter((entry) =>
      entry.project !== entry.saved && !list.some((plan) => plan.id === entry.record.id)
    ).map(({ project, record }) => ({ id: record.id, name: project.name, updatedAt: project.updatedAt }))],
    listStatus, refresh, open, edit, saveNew, remove, dropDraft, flush,
    restart: (id) => save(entries.current.get(id)),
    current: (id) => entries.current.get(id),
    dirty: () => activeEntries().some((entry) => entry.project !== entry.saved),
  };
}
