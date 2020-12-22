/** A GQL tag shim for improving IDE support for inline GraphQL queries */
export const gql = (data: TemplateStringsArray) => data[0];

export interface HasuraEventPayload {
  event: HasuraEvent;
  created_at: string;
  id: string;
  trigger: {
    name: string;
  };
  table: {
    schema: string;
    name: string;
  };
}

export interface HasuraEvent {
  session_variables: { [key: string]: string };
  op: string;
  data: {
    // deno-lint-ignore no-explicit-any
    old: { [key: string]: any };
    // deno-lint-ignore no-explicit-any
    new: { [key: string]: any };
  };
}

export interface LoginResponse {
  mfa?: boolean;
  jwt_token: string;
  jwt_expires_in: number;
}

export class HasuraClient {
  private hasuraEndpoint: string;

  constructor({ hasuraUrl }: { hasuraUrl: string }) {
    this.hasuraEndpoint = hasuraUrl + "/v1/graphql";
  }

  /**
   * Call a GraphQL query or mutation.
   *
   * > Note: Throws an exception of there are any HTTP or GraphQL errors.
   *
   * @param query The GraphQL query to execute
   * @param variables The GraphQL variables to add to the query
   */
  async call(
    query: string,
    jwt?: string,
    // deno-lint-ignore no-explicit-any
    variables?: { [key: string]: any }
    // deno-lint-ignore no-explicit-any
  ): Promise<any> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (jwt) {
      headers["Authorization"] = "Bearer " + jwt;
    }

    const resp = await fetch(this.hasuraEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!resp.ok) {
      console.error("HTTP Error:", resp);
      throw resp;
    }

    const data = await resp.json();

    if (data.errors) {
      console.error("GraphQL Error:", data);
      throw data;
    }

    return data;
  }
}
