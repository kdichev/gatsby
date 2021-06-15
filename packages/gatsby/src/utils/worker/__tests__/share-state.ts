import * as path from "path"
import fs from "fs-extra"
import { createTestWorker, GatsbyTestWorkerPool } from "./test-helpers"
import {
  store,
  saveState,
  saveStateForWorkers,
  loadStateInWorker,
} from "../../../redux"
import { GatsbyStateKeys } from "../../../redux/types"

let worker: GatsbyTestWorkerPool | undefined

const dummyPagePayload = {
  path: `/foo/`,
  component: `/foo`,
}

describe(`worker (share-state)`, () => {
  beforeEach(() => {
    store.dispatch({ type: `DELETE_CACHE` })
    const fileDir = path.join(process.cwd(), `.cache/redux`)
    fs.emptyDirSync(fileDir)
  })

  afterEach(() => {
    if (worker) {
      worker.end()
      worker = undefined
    }
  })

  it(`doesn't load all of state persisted by main process`, async () => {
    store.dispatch({
      type: `CREATE_PAGE`,
      payload: dummyPagePayload,
      plugin: {
        name: `test`,
      },
    })

    saveState()

    expect(store.getState().pages.get(dummyPagePayload.path))
      .toMatchInlineSnapshot(`
      Object {
        "component": "/foo",
        "componentPath": "/foo",
        "path": "/foo/",
      }
    `)

    worker = createTestWorker()

    const result = await worker.getPage(dummyPagePayload.path)

    expect(result).toBe(null)
  })

  it(`saves and retrieves state for workers correctly`, () => {
    store.dispatch({
      type: `CREATE_PAGE`,
      payload: dummyPagePayload,
      plugin: {
        name: `test`,
      },
    })
    store.dispatch({
      type: `REPLACE_STATIC_QUERY`,
      plugin: {
        name: `test`,
      },
      payload: {
        name: `foo`,
        componentPath: `/foo`,
        id: `1`,
        query: `query`,
        hash: `hash`,
      },
    })

    const slicesOne: Array<GatsbyStateKeys> = [`components`]
    const slicesTwo: Array<GatsbyStateKeys> = [
      `components`,
      `staticQueryComponents`,
    ]

    saveStateForWorkers(slicesOne)
    const resultOne = loadStateInWorker(slicesOne)

    expect(resultOne).toMatchInlineSnapshot(`
      Object {
        "components": Map {
          "/foo" => Object {
            "componentChunkName": undefined,
            "componentPath": "/foo",
            "isInBootstrap": true,
            "pages": Set {
              "/foo/",
            },
            "query": "",
          },
        },
      }
    `)

    saveStateForWorkers(slicesTwo)

    const resultTwo = loadStateInWorker(slicesTwo)

    expect(resultTwo).toMatchInlineSnapshot(`
      Object {
        "components": Map {
          "/foo" => Object {
            "componentChunkName": undefined,
            "componentPath": "/foo",
            "isInBootstrap": true,
            "pages": Set {
              "/foo/",
            },
            "query": "",
          },
        },
        "staticQueryComponents": Map {
          "1" => Object {
            "componentPath": "/foo",
            "hash": "hash",
            "id": "1",
            "name": "foo",
            "query": "query",
          },
        },
      }
    `)
  })

  it(`stores empty state with no slices`, () => {
    store.dispatch({
      type: `CREATE_PAGE`,
      payload: dummyPagePayload,
      plugin: {
        name: `test`,
      },
    })

    const slices: Array<GatsbyStateKeys> = []

    saveStateForWorkers(slices)
    const result = loadStateInWorker(slices)

    expect(result).toEqual({})
  })

  it(`returns default for slice even if no data is given`, () => {
    store.dispatch({
      type: `CREATE_PAGE`,
      payload: dummyPagePayload,
      plugin: {
        name: `test`,
      },
    })

    const slices: Array<GatsbyStateKeys> = [`staticQueryComponents`]

    saveStateForWorkers(slices)
    const result = loadStateInWorker(slices)

    expect(result).toMatchInlineSnapshot(`
      Object {
        "staticQueryComponents": Map {},
      }
    `)
  })

  it(`can set slices results into state and access page & static queries`, async () => {
    worker = createTestWorker()
    const staticQueryID = `1`

    store.dispatch({
      type: `CREATE_PAGE`,
      payload: dummyPagePayload,
      plugin: {
        name: `test`,
      },
    })

    store.dispatch({
      type: `REPLACE_STATIC_QUERY`,
      plugin: {
        name: `test`,
      },
      payload: {
        name: `foo`,
        componentPath: dummyPagePayload.component,
        id: staticQueryID,
        query: `I'm a static query`,
        hash: `hash`,
      },
    })

    store.dispatch({
      type: `QUERY_EXTRACTED`,
      payload: {
        componentPath: `/foo`,
        componentChunkName: `foo`,
        query: `I'm a page query`,
      },
      plugin: {
        name: `test`,
      },
    })

    saveStateForWorkers([`components`, `staticQueryComponents`])

    await worker.setQueries()

    const components = await worker.getComponent(dummyPagePayload.component)
    const staticQueryComponents = await worker.getStaticQueryComponent(
      staticQueryID
    )

    expect(components).toMatchInlineSnapshot(`
      Object {
        "componentPath": "/foo",
        "isInBootstrap": true,
        "pages": Object {},
        "query": "I'm a page query",
      }
    `)

    expect(staticQueryComponents).toMatchInlineSnapshot(`
      Object {
        "componentPath": "/foo",
        "hash": "hash",
        "id": "1",
        "name": "foo",
        "query": "I'm a static query",
      }
    `)
  })

  it(`can set slices results into state and access inference metadata`, async () => {
    worker = createTestWorker()

    store.dispatch({
      type: `BUILD_TYPE_METADATA`,
      payload: {
        typeName: `Test`,
        nodes: [
          {
            id: `1`,
            parent: null,
            children: [],
            foo: `bar`,
            internal: { type: `Test` },
          },
        ],
      },
    })

    saveStateForWorkers([`inferenceMetadata`])

    await worker.setInferenceMetadata()

    const inf = await worker.getInferenceMetadata(`Test`)

    expect(inf).toMatchInlineSnapshot(`
      Object {
        "dirty": true,
        "fieldMap": Object {
          "foo": Object {
            "string": Object {
              "example": "bar",
              "first": "1",
              "total": 1,
            },
          },
        },
        "ignoredFields": Object {},
        "total": 1,
      }
    `)
  })
})
