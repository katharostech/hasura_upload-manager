import { Application, Router, Context, Status, send } from "./deps/oak.ts";
import { HasuraEventPayload, HasuraClient, gql } from "./hasura.ts";
import { getCookies } from "./deps/cookie.ts";

const secretHeaderName = "x-hasura-upload-manager-secret";
const secret = Deno.env.get("HASURA_UPLOAD_MANAGER_SECRET");

const HASURA_URL = Deno.env.get("HASURA_URL");
const DATA_DIR = Deno.env.get("DATA_DIR");

if (!HASURA_URL) {
  throw "Missing HASURA_URL environment variable";
}

if (!DATA_DIR) {
  throw "Missing DATA_DIR environment variable";
}

const router = new Router();

const hasuraClient = new HasuraClient({
  hasuraUrl: HASURA_URL,
});

//
// Register hasura event webhook listener
//

router.post("/uploads/hasura/events", async (ctx) => {
  if (ctx.request.headers.get(secretHeaderName) != secret) {
    ctx.throw(Status.Forbidden, `'${secretHeaderName}' header does not match`);
  }

  const eventBody = (await ctx.request.body().value) as HasuraEventPayload;

  switch (eventBody.trigger.name) {
    case "upload_deleted":
      return await handleUploadDeleted(ctx, eventBody);
  }
});

async function handleUploadDeleted(
  ctx: Context,
  body: HasuraEventPayload
): Promise<void> {
  const id = body.event.data.old.id as string;
  console.log(id);
  try {
    await Deno.remove(DATA_DIR + "/" + id);
  } catch (e) {
    console.warn("Could not delete upload", e);
  }

  ctx.response.status = Status.OK;
}

//
// Register upload content endpoints
//

router.get("/uploads/:id", async (ctx) => {
  // Get the JWT from the authorization header
  const jwt = getCookies({ headers: ctx.request.headers })[
    "__Host-Authorization"
  ];

  if (!(ctx.params && ctx.params.id)) {
    ctx.throw(Status.BadRequest, `Request must provide an upload ID`);
    return;
  }

  const resp = await hasuraClient.call(
    gql`
      query Upload($id: uuid!) {
        upload: uploads_by_pk(id: $id) {
          id
        }
      }
    `,
    jwt,
    {
      id: ctx.params.id,
    }
  );

  // If the query successfully found the upload file, then the current user can access that upload.
  if (resp.data && resp.data.upload) {
    // Return the upload
    await send(ctx, ctx.params.id, {
      root: DATA_DIR,
    });
    return;
  } else {
    // Return 404 if the upload cannot be accessed
    ctx.throw(
      Status.NotFound,
      "Upload not found or not accessible to the current user"
    );
    return;
  }
});

router.post("/uploads/:id", async (ctx) => {
  // Get the JWT from the authorization header
  const jwt = getCookies({ headers: ctx.request.headers })[
    "__Host-Authorization"
  ];

  if (!(ctx.params && ctx.params.id)) {
    ctx.throw(Status.BadRequest, `Request must provide an upload ID`);
    return;
  }

  if (!ctx.request.hasBody) {
    ctx.throw(Status.BadRequest, "Request must contain upload body");
  }

  // If the query successfully found the upload file, then the current user can access that upload.
  try {
    const resp = await hasuraClient.call(
      gql`
        mutation Upload($id: uuid!) {
          upload: update_uploads_by_pk(
            pk_columns: { id: $id }
            # This does not actually need to change anything, it just needs to make sure that
            # the user has write access to the record
            _set: { id: $id }
          ) {
            id
            __typename
          }
        }
      `,
      jwt,
      {
        id: ctx.params.id,
      }
    );

    if (!(resp.data && resp.data.upload)) {
      throw "Upload not found or not accessible to the current user";
    }
  } catch (e) {
    // Return 404 if the upload cannot be accessed
    ctx.throw(
      Status.NotFound,
      "Upload not found or not accessible to the current user"
    );
    return;
  }

  try {
    const body = await ctx.request.body({ type: "form-data" }).value.read({});
    const files = body.files;
    if (!files) {
      throw "Missing uploaded file";
    }

    if (files.length != 1) {
      throw "Only one file can be uploaded at a time";
    }
    const file = files[0];

    await Deno.copyFile(file.filename!, DATA_DIR + "/" + ctx.params.id);

    ctx.response.status = Status.Created;
  } catch (e) {
    console.error(e);
    ctx.throw(Status.InternalServerError, `Error writing file: ${e}`);
    return;
  }
});

//
// Start webserver
//

const app = new Application();

app.use(router.routes());
app.use(router.allowedMethods());

const port = 8912;
console.log("Starting webserver on port " + port);
await app.listen({ port });
