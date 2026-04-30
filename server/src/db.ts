import { Collection, MongoClient } from "mongodb";
import { MONGO_COLLECTION, MONGO_DB, MONGO_URI } from "./config.js";

export type MatrixDoc = {
  _id: string;
  ciphertext: string;
  lamport: number;
  version: number;
  createdDate: string;
  lastWriteDate: string;
  lastReadDate: string | null;
};

let client: MongoClient | null = null;
let coll: Collection<MatrixDoc> | null = null;

export async function getCollection(): Promise<Collection<MatrixDoc>> {
  if (coll) return coll;
  if (!MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }
  client = new MongoClient(MONGO_URI);
  await client.connect();
  coll = client.db(MONGO_DB).collection<MatrixDoc>(MONGO_COLLECTION);
  await coll.createIndex({ lastReadDate: 1 });
  await coll.createIndex({ lastWriteDate: 1 });
  return coll;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    coll = null;
  }
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
