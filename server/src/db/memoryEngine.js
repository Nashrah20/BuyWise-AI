/**
 * memoryEngine.js
 * -----------------------------------------------------------------------------
 * A tiny, dependency-free MongoDB-compatible engine.
 *
 * BuyWise talks to ONE data interface (see db/index.js). In production that
 * interface is backed by the real MongoDB driver. When no MONGO_URI is
 * configured we back it with this engine instead, so the whole platform boots
 * with zero setup and still persists between restarts (JSON files in .data/).
 *
 * It implements the subset of the Mongo query language BuyWise actually uses:
 *   filters : equality, dotted paths, $eq $ne $gt $gte $lt $lte $in $nin
 *             $regex $exists $all $size, and $and / $or / $nor
 *   updates : $set $unset $inc $push $pull
 *   cursors : sort / skip / limit / projection
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), '.data');

/* ------------------------------------------------------------------ helpers */

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

/** Read a dotted path such as "features.battery" out of a document. */
function getPath(doc, pathStr) {
  return pathStr.split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (Array.isArray(acc)) {
      // Mongo semantics: reaching into an array maps over its elements.
      const mapped = acc.map((el) => (el ? el[key] : undefined)).filter((v) => v !== undefined);
      return mapped.length ? mapped : undefined;
    }
    return acc[key];
  }, doc);
}

/** Write a dotted path into a document, creating intermediate objects. */
function setPath(doc, pathStr, value) {
  const keys = pathStr.split('.');
  let node = doc;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (!isPlainObject(node[keys[i]])) node[keys[i]] = {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

function unsetPath(doc, pathStr) {
  const keys = pathStr.split('.');
  let node = doc;
  for (let i = 0; i < keys.length - 1; i += 1) {
    node = node[keys[i]];
    if (!isPlainObject(node)) return;
  }
  delete node[keys[keys.length - 1]];
}

const looseEqual = (a, b) => {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (isPlainObject(a) && isPlainObject(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
};

/** Does one field value satisfy one condition (a raw value or an operator object)? */
function matchValue(actual, condition) {
  if (isPlainObject(condition)) {
    const ops = Object.keys(condition);
    if (ops.some((k) => k.startsWith('$'))) {
      return ops.every((op) => {
        const expected = condition[op];
        switch (op) {
          case '$eq':
            return Array.isArray(actual)
              ? actual.some((v) => looseEqual(v, expected))
              : looseEqual(actual, expected);
          case '$ne':
            return !matchValue(actual, { $eq: expected });
          case '$gt':
            return actual !== undefined && actual > expected;
          case '$gte':
            return actual !== undefined && actual >= expected;
          case '$lt':
            return actual !== undefined && actual < expected;
          case '$lte':
            return actual !== undefined && actual <= expected;
          case '$in':
            return Array.isArray(actual)
              ? actual.some((v) => expected.some((e) => looseEqual(v, e)))
              : expected.some((e) => looseEqual(actual, e));
          case '$nin':
            return !matchValue(actual, { $in: expected });
          case '$exists':
            return expected ? actual !== undefined : actual === undefined;
          case '$all':
            return (
              Array.isArray(actual) && expected.every((e) => actual.some((v) => looseEqual(v, e)))
            );
          case '$size':
            return Array.isArray(actual) && actual.length === expected;
          case '$regex': {
            const re =
              expected instanceof RegExp
                ? expected
                : new RegExp(expected, condition.$options || '');
            if (Array.isArray(actual)) return actual.some((v) => typeof v === 'string' && re.test(v));
            return typeof actual === 'string' && re.test(actual);
          }
          case '$not':
            return !matchValue(actual, expected);
          case '$options':
            return true; // consumed by $regex
          default:
            return false;
        }
      });
    }
  }
  // Plain value: arrays match if any element matches (Mongo behaviour).
  if (Array.isArray(actual) && !Array.isArray(condition)) {
    return actual.some((v) => looseEqual(v, condition));
  }
  return looseEqual(actual, condition);
}

/** Does a document satisfy a whole filter? */
export function matchesFilter(doc, filter = {}) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$and') return condition.every((sub) => matchesFilter(doc, sub));
    if (key === '$or') return condition.some((sub) => matchesFilter(doc, sub));
    if (key === '$nor') return !condition.some((sub) => matchesFilter(doc, sub));
    return matchValue(getPath(doc, key), condition);
  });
}

function applyUpdate(doc, update) {
  const next = structuredClone(doc);
  for (const [operator, payload] of Object.entries(update)) {
    switch (operator) {
      case '$set':
        for (const [k, v] of Object.entries(payload)) setPath(next, k, v);
        break;
      case '$unset':
        for (const k of Object.keys(payload)) unsetPath(next, k);
        break;
      case '$inc':
        for (const [k, v] of Object.entries(payload)) setPath(next, k, (getPath(next, k) || 0) + v);
        break;
      case '$push':
        for (const [k, v] of Object.entries(payload)) {
          const existing = getPath(next, k);
          const list = Array.isArray(existing) ? existing : [];
          if (isPlainObject(v) && Object.hasOwn(v, '$each')) list.push(...v.$each);
          else list.push(v);
          setPath(next, k, list);
        }
        break;
      case '$pull':
        for (const [k, v] of Object.entries(payload)) {
          const existing = getPath(next, k);
          if (Array.isArray(existing)) {
            setPath(next, k, existing.filter((el) => !matchValue(el, v)));
          }
        }
        break;
      default:
        // A bare replacement field.
        if (!operator.startsWith('$')) setPath(next, operator, payload);
    }
  }
  return next;
}

function applyProjection(doc, projection) {
  if (!projection) return doc;
  const keys = Object.keys(projection).filter((k) => k !== '_id');
  const including = keys.some((k) => projection[k]);
  if (!including) {
    const out = structuredClone(doc);
    for (const k of keys) unsetPath(out, k);
    if (projection._id === 0) delete out._id;
    return out;
  }
  const out = {};
  for (const k of keys) {
    const v = getPath(doc, k);
    if (v !== undefined) setPath(out, k, v);
  }
  if (projection._id !== 0) out._id = doc._id;
  return out;
}

function compareForSort(a, b, sort) {
  for (const [key, dir] of Object.entries(sort)) {
    const av = getPath(a, key);
    const bv = getPath(b, key);
    if (av === bv) continue;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return (av > bv ? 1 : -1) * (dir < 0 ? -1 : 1);
  }
  return 0;
}

/* ----------------------------------------------------------- the collection */

class MemoryCollection {
  constructor(name, store) {
    this.name = name;
    this.store = store;
    this.docs = store.load(name);
  }

  persist() {
    this.store.save(this.name, this.docs);
  }

  async find(filter = {}, options = {}) {
    let out = this.docs.filter((d) => matchesFilter(d, filter));
    if (options.sort) out = [...out].sort((a, b) => compareForSort(a, b, options.sort));
    if (options.skip) out = out.slice(options.skip);
    if (options.limit) out = out.slice(0, options.limit);
    return out.map((d) => applyProjection(structuredClone(d), options.projection));
  }

  async findOne(filter = {}, options = {}) {
    const [doc] = await this.find(filter, { ...options, limit: 1 });
    return doc || null;
  }

  async insertOne(doc) {
    this.docs.push(structuredClone(doc));
    this.persist();
    return { acknowledged: true, insertedId: doc._id };
  }

  async insertMany(docs) {
    this.docs.push(...docs.map((d) => structuredClone(d)));
    this.persist();
    return { acknowledged: true, insertedCount: docs.length };
  }

  async updateOne(filter, update, options = {}) {
    const index = this.docs.findIndex((d) => matchesFilter(d, filter));
    if (index === -1) {
      if (!options.upsert) return { matchedCount: 0, modifiedCount: 0 };
      const base = {};
      for (const [k, v] of Object.entries(filter)) {
        if (!k.startsWith('$') && !isPlainObject(v)) setPath(base, k, v);
      }
      await this.insertOne(applyUpdate(base, update));
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    this.docs[index] = applyUpdate(this.docs[index], update);
    this.persist();
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(filter, update) {
    let count = 0;
    this.docs = this.docs.map((d) => {
      if (!matchesFilter(d, filter)) return d;
      count += 1;
      return applyUpdate(d, update);
    });
    this.persist();
    return { matchedCount: count, modifiedCount: count };
  }

  async deleteOne(filter) {
    const index = this.docs.findIndex((d) => matchesFilter(d, filter));
    if (index === -1) return { deletedCount: 0 };
    this.docs.splice(index, 1);
    this.persist();
    return { deletedCount: 1 };
  }

  async deleteMany(filter = {}) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matchesFilter(d, filter));
    this.persist();
    return { deletedCount: before - this.docs.length };
  }

  async countDocuments(filter = {}) {
    return this.docs.filter((d) => matchesFilter(d, filter)).length;
  }

  async distinct(field, filter = {}) {
    const values = this.docs
      .filter((d) => matchesFilter(d, filter))
      .flatMap((d) => {
        const v = getPath(d, field);
        return Array.isArray(v) ? v : [v];
      })
      .filter((v) => v !== undefined);
    return [...new Set(values)];
  }
}

/* ---------------------------------------------------------------- the store */

export class MemoryStore {
  constructor(dir = DATA_DIR) {
    this.dir = dir;
    this.collections = new Map();
    fs.mkdirSync(this.dir, { recursive: true });
  }

  filePath(name) {
    return path.join(this.dir, `${name}.json`);
  }

  load(name) {
    try {
      return JSON.parse(fs.readFileSync(this.filePath(name), 'utf8'));
    } catch {
      return [];
    }
  }

  save(name, docs) {
    fs.writeFileSync(this.filePath(name), JSON.stringify(docs, null, 2));
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MemoryCollection(name, this));
    }
    return this.collections.get(name);
  }
}
