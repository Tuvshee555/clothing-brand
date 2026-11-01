// Starts a throwaway PostgreSQL for the integration suite, builds a template
// database (migrations + full seed) and hands its URL to the tests. Each test
// file clones the template, so tests never share state — and never touch the
// real (Neon) database.
import EmbeddedPostgres from 'embedded-postgres'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import pg from 'pg'
import type { TestProject } from 'vitest/node'
import { runMigrations, withDb } from '../../scripts/lib/tasks'
import { seed } from '../../src/server/seed'

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string
    pgTemplate: string
  }
}

const PORT = 54_400 + (process.pid % 300)
const TEMPLATE = 'it_template'

export default async function setup(project: TestProject) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manan-it-'))
  const server = new EmbeddedPostgres({
    databaseDir: path.join(dir, 'data'),
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-c', 'timezone=UTC', '-c', 'fsync=off', '-c', 'log_min_messages=warning'],
    onLog: () => {},
    onError: () => {},
  })
  await server.initialise()
  await server.start()

  const adminUrl = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query(`create database ${TEMPLATE}`)
  await admin.end()

  const templateUrl = `postgres://postgres:postgres@127.0.0.1:${PORT}/${TEMPLATE}`
  await runMigrations(templateUrl)
  await withDb(templateUrl, (db) => seed(db, { owner: { email: 'owner@test.example', password: 'Test-Owner-Password-1', name: 'Тест эзэмшигч' } }))

  project.provide('pgAdminUrl', adminUrl)
  project.provide('pgTemplate', TEMPLATE)

  return async () => {
    await server.stop().catch(() => {})
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
