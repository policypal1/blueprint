import { MAX_FILE_BYTES, validateProject } from './editor-core.js';

const SUMMARY = 'id,name,updated_at,revision';
const METADATA = `${SUMMARY},background_path,write_id`;
const PAGE_SIZE = 100;

export class ProjectConflict extends Error {
  constructor() {
    super('This plan changed on another device. Save your changes as a copy.');
    this.name = 'ProjectConflict';
  }
}

function result({ data, error }) {
  if (error) throw error;
  return data;
}

function planSummary(row) {
  return { id: row.id, name: row.name, updatedAt: Date.parse(row.updated_at), revision: row.revision };
}

function readImage(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

export function createProjectRepository(client, userId) {
  const assets = client.storage.from('blueprints');
  const projects = () => client.from('projects');
  const ownedProject = (query, id) => query.eq('user_id', userId).eq('id', id);

  async function saveImage(id, image) {
    if (!image) return null;
    // The input is a validated data URL. Decode it without making a network request.
    const comma = image.indexOf(',');
    const type = image.slice(5, comma - ';base64'.length);
    const binary = atob(image.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('Choose a blueprint image under 25 MB.');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const digest = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const path = `${userId}/${id}/${digest}.${type.slice('image/'.length)}`;
    const { error } = await assets.upload(path, new Blob([bytes], { type }), { contentType: type });
    // Supabase rejects a second upload to an existing immutable path.
    if (error && !['Duplicate', 'ResourceAlreadyExists'].includes(error.code) && Number(error.statusCode ?? error.status) !== 409)
      throw error;
    return path;
  }

  return {
    async list() {
      const summaries = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const page = result(await projects().select(SUMMARY).eq('user_id', userId)
          .order('updated_at', { ascending: false }).order('id').range(from, from + PAGE_SIZE - 1));
        summaries.push(...page.map(planSummary));
        if (page.length < PAGE_SIZE) return summaries;
      }
    },

    async open(id) {
      const row = result(await ownedProject(projects().select(`${METADATA},drawing`), id).single());
      const background = row.background_path
        ? await readImage(result(await assets.download(row.background_path)))
        : null;
      const project = validateProject({ ...row.drawing, name: row.name, background });
      return { project, record: row };
    },

    async save(project, record, savedProject, writeId) {
      const { background, name, ...drawing } = validateProject(project);
      const path = savedProject && background === savedProject.background
        ? record.background_path
        : await saveImage(record.id, background);
      const patch = {
        name, drawing, background_path: path, revision: record.revision + 1, write_id: writeId,
      };
      const response = record.revision === 0
        ? await projects().insert({ ...patch, id: record.id, user_id: userId }).select(METADATA).single()
        : await ownedProject(projects().update(patch), record.id)
          .eq('revision', record.revision).select(METADATA).maybeSingle();
      if (response.data) return response.data;
      if (response.error && response.error.code !== '23505') throw response.error;
      const current = result(await ownedProject(projects().select(METADATA), record.id).maybeSingle());
      if (current?.write_id === writeId) return current;
      throw new ProjectConflict();
    },

    async remove(record) {
      const row = result(await ownedProject(projects().delete(), record.id)
        .eq('revision', record.revision).select('id').maybeSingle());
      if (!row) {
        const current = result(await ownedProject(projects().select('id'), record.id).maybeSingle());
        if (current) throw new ProjectConflict();
      }

      const prefix = `${userId}/${record.id}`;
      // Gather paths before deleting so offsets stay stable across pages.
      const paths = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const files = result(await assets.list(prefix, { limit: PAGE_SIZE, offset }));
        paths.push(...files.map((file) => `${prefix}/${file.name}`));
        if (files.length < PAGE_SIZE) break;
      }
      for (let offset = 0; offset < paths.length; offset += PAGE_SIZE) {
        result(await assets.remove(paths.slice(offset, offset + PAGE_SIZE)));
      }
    },
  };
}
