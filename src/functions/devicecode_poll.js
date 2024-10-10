const { app } = require("@azure/functions");
const axios = require('axios');

const client_id = '00b41c95-dab0-4487-9791-b9d2c32c80f2';
const token_endpoint = "https://login.microsoftonline.com/common/oauth2/token";

app.http("poll", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "/deviceCode",
  handler: async (request, context) => {

    const request_body = await request.json();

    context.log(`Received device code: ${JSON.stringify(request_body)}`)
    let devicecode = null;
    let poll_count = 0;
    // poll for a maximum of 5 minutes (5s * 12 * 5 = 300s)
    while (!devicecode && poll_count++ < 12 * 5) {
      devicecode = await axios.post(token_endpoint, {
        "client_id": client_id,
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        "resource": "https://graph.microsoft.com",
        "code": request_body.device_code
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'AzureAiTMFunction'
        }
      }).then(response => {
        //context.log(`Received response with status: ${response.status}`)
        return response.data
      })
        .catch((ex) => {
          if (ex.response.data.error === "authorization_pending") {
            console.debug(ex.response.data.error_description);
          } else {
            console.error(ex.response.data);
          }
        });

      if (devicecode) {
        context.log(`Device code: ${JSON.stringify(devicecode)}`)
      } else {
        context.log(`No device code yet, polling again... (${poll_count})`)
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // return 204 no content
    return new Response(null, {
      status: 204
    });
  },
});

