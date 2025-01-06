// Spotify API AUTHORIZATION
//var crypto = require("crypto");

const clientId = "327e131484724396b28b9f881dfdd057";
const redirectUrl = "http://localhost:5500/authcallback";

const authorizationEndpoint = "https://accounts.spotify.com/authorize";
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const scope =
  "user-read-private user-read-email user-top-read playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-modify user-library-read ugc-image-upload";

//Manage Current token in local storage
const currentToken = {
  get access_token() {
    return localStorage.getItem("access_token") || null;
  },
  get refresh_token() {
    return localStorage.getItem("refresh_token") || null;
  },
  get expires_in() {
    return localStorage.getItem("refresh_in") || null;
  },
  get expires() {
    return localStorage.getItem("expires") || null;
  },

  save: function (response) {
    const { access_token, refresh_token, expires_in } = response;
    localStorage.setItem("access_token", access_token);
    localStorage.setItem("refresh_token", refresh_token);
    localStorage.setItem("expires_in", expires_in);

    const now = new Date();
    const expiry = new Date(now.getTime() + expires_in * 1000);
    localStorage.setItem("expires", expiry);
  },
};

// On page load, try to fetch auth code from current browser search URL
const args = new URLSearchParams(window.location.search);
const code = args.get("code");

console.log("Authorization Code: ", code);

// If we find a code, we're in a callback, do a token exchange
window.onload = function () {
  console.log("Authorization code:", code);

  if (code) {
    const token = getToken(code);
    currentToken.save(token);

    const url = new URL(window.location.href);

    // Remove the 'code' parameter from the URL
    url.searchParams.delete("code");

    // Update the URL without refreshing the page
    window.history.replaceState({}, document.title, url.toString());
  }
};

// If we have a token, we're logged in, so fetch user data and render logged in template
// if (currentToken.access_token) {
//   const userData = await getUserData();
// }

// Authorization Functions
async function redirectToSpotifyAuth() {
  // Define characters for random string generation
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  // Generate random values for the code_verifier
  const randomValues = crypto.getRandomValues(new Uint8Array(64));
  const randomString = randomValues.reduce(
    (acc, x) => acc + possible[x % possible.length],
    ""
  );

  // The code_verifier is now ready to use
  const code_verifier = randomString;

  // Hash the code_verifier to create the code_challenge
  const data = new TextEncoder().encode(code_verifier);
  const hashed = await crypto.subtle.digest("SHA-256", data);

  // Base64 encode the hashed code_verifier
  let code_challenge_base64 = btoa(
    String.fromCharCode(...new Uint8Array(hashed))
  )
    .replace(/=/g, "") // Remove padding
    .replace(/\+/g, "-") // URL-safe Base64 encoding
    .replace(/\//g, "_"); // URL-safe Base64 encoding

  // Store the code_verifier securely (for later use in token exchange)
  window.localStorage.setItem("code_verifier", code_verifier);

  //Construct the Spotify Authorization URL
  const authUrl = new URL(authorizationEndpoint);
  const params = {
    response_type: "code",
    client_id: clientId, // Your Spotify Client ID
    scope: scope, // Requested permissions/scopes
    code_challenge_method: "S256", // PKCE challenge method
    code_challenge: code_challenge_base64, // The hashed code_verifier (the challenge)
    redirect_uri: redirectUrl, // The URL to which Spotify will redirect after authentication
  };

  // Append the query parameters to the authorization URL
  Object.keys(params).forEach((key) =>
    authUrl.searchParams.append(key, params[key])
  );

  // Redirect the user to Spotify's authorization page
  window.location.href = authUrl.toString();
}

//Login button

const loginButton = document.getElementById("spotifyLogin");

loginButton.addEventListener("click", () => {
  redirectToSpotifyAuth();
});
