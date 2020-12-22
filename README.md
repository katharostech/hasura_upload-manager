# Hasura Upload Manager

> **Note:** This is _just_ out the door and is hardly tested. There may be bugs and it is hardly documented. Still the concept is sound, the code is ultra simple and short, and you might be able to re-purpose it for your own designs.

Hasura Upload Manager is a super simple solution for managing uploads in [Hasura].

[hasura]: https://hasura.io

## Purpose

This service was designed to provide a method of managing hasura uploads that allows you to manage the permissions on the uploaded files using Hasura's powerful access control rules, just like you can for access to tables. This was the motivation to create a custom upload handler instead of just using the one built into the very useful [Hasura Backend Plus][hbp].

[hbp]: https://github.com/nhost/hasura-backend-plus

## How it Works

Hasura Upload Manager works by creating an `uploads` table in the Hasura database. This table has only one column: `id`. If you were using uploads for posts in a blog, for example, you would add a column to that table such as `post_id` and setup a foreign key and a hasura relationship that ties each upload to a particular post.

With the relationship between posts and uploads established, you can now use hasura to set the permissions on the uploads table to reflect situations like:

- Only users who are the author of the post can write to the upload:
  ```json
  { "post": { "primary_author_id": { "_eq": "X-Hasura-User-Id" } } }
  ```
- Anonymous users can read the uploads but only if the post is published:
  ```json
  { "post": { "published": { "_eq": true } } }
  ```

To create uploads, you simply add a record to this table, but the table only tracks the id of the upload, not the upload content. You must use the Hasura Upload Manager REST API to actually upload and read the file contents.

Whenever you try to upload or read a file from the Hasura Upload Manager REST API, it will execute a GraphQL query against the uploads table in Hasura to make sure that the user has permission to desired upload. If the permissions don't check out, the file is not modified/retrieved. In this way we can completely manage file access through Hasura.

When you delete an upload from from the uploads table a hasura event will go tell the Hasura Upload Manager to delete the file on disk.

## Setting up Hasura

### The Uploads Table

In order to use with your Hasura instance, you have just have to create an `uploads` table with an `id` column in the `public` schema. This table can have any number of _other_ columns or relationships that you need to help establish the permissions needed for your app.

### The `upload_deleted` Event

You also need to create a Hasura event that listens for `delete` events on the `uploads` table and sends it to the `/uploads/hasura/events` endpoint of the Hasura Upload Manager.

The event must be called `upload_deleted` and it must also send an `x-hasura-upload-manager-secret` header that matches the `HASURA_UPLOAD_MANAGER_SECRET` environment variable that must be set when running the Hasura Upload Manager.

## Deploying Hasura Upload Manager

Hasura Upload Manager is a tiny [Deno] application, which can be run by [installing][deno_inst] Deno and running:

    git clone https://github.com/katharostech/hasura_upload-manager.git
    cd hasura_upload-manager
    export HASURA_UPLOAD_MANAGER_SECRET="secret"
    export HASURA_URL="http://my-hasura-server"
    export DATA_DIR="/uploads/path"
    deno run --allow-net=$HASURA_URL --allow-read=$DATA_DIR --allow-write=$DATA_DIR --allow-env index.ts

[deno]: https://deno.land
[deno_inst]: https://deno.land/#installation

## Handling Auth in Your Frontend

> **Note:** The Hasura Upload Manager currently only works with Hasura when Hasura is using JWT auth, but it would be trivial to modify it to work with other auth methods such as webhook auth.

Hasura Upload Manager is configured to read the `__Host-Authorization` cookie, which must contain the JWT token that identifies the current user in order to authenticate requests. Hasura Upload Manger will send the contents of this cookie, if present, as the bearer token to the Hasura server when validating permissions to the upload. If the cookie is not present, the user will be considered anonymous.
