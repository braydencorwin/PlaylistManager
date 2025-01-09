// Spotify API AUTHORIZATION
//var crypto = require("crypto");

const clientId = "327e131484724396b28b9f881dfdd057";
const redirectUrl = "http://localhost:5500/index";

const authorizationEndpoint = "https://accounts.spotify.com/authorize";
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const scope =
  "user-read-private user-read-email user-top-read playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-modify user-library-read ugc-image-upload";

//DOM Variables
const loginModal = document.getElementById("login");

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

window.onload = function () {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code"); // Extract the authorization code from the URL

  const url = new URL(window.location.href);
  url.searchParams.delete("code");

  // Update the URL without refreshing the page
  window.history.replaceState({}, document.title, url.toString());

  // If we find a code, we're in a callback, do a token exchange
  if (code) {
    console.log("Authorization code:", code);
    localStorage.setItem("authCode", code);
    params.delete("code");

    // Retrieve the code verifier from localStorage
    const codeVerifier = localStorage.getItem("code_verifier");
    if (codeVerifier) {
      // Now exchange the code for an access token
      exchangeCodeForToken(code)
        .then(() => getUserProfile())
        .then((name) => setupUi(name));
    } else {
      console.error("Code verifier not found.");
    }
  } else {
    console.error("No authorization code found in the URL.");
  }
};

// Exchange the code for a token
async function exchangeCodeForToken(authCode) {
  const tokenUrl = "https://accounts.spotify.com/api/token";
  const clientId = "327e131484724396b28b9f881dfdd057";
  const redirectUri = "http://localhost:5500/index";
  let codeVerifier = localStorage.getItem("code_verifier");
  const payload = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: authCode,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  };

  const response = await fetch(tokenUrl, payload)
    .then((response) => response.json())
    .then((data) => {
      if (data.access_token) {
        console.log("Access Token:", data.access_token);
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("expiry", Date.now());
        localStorage.setItem("refreshToken", data.refresh_token);
      } else {
        console.error("Failed to obtain access token.");
      }
    })
    .catch((error) => {
      console.error("Error exchanging code for token:", error);
    });
}

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

let expiresIn = 3600;

const bufferMinutes = 5;

function isAccessTokenExpired() {
  let accessTokenAcquiredAt = localStorage.getItem("expiry");
  const expirationTime = accessTokenAcquiredAt + expiresIn * 1000; // Convert expires_in to milliseconds
  const bufferTime = bufferMinutes * 60 * 1000; // refresh token proactively
  return Date.now() > expirationTime - bufferTime; // Check if current time is greater than expiration time
}

async function getRefreshToken() {
  const refreshToken = localStorage.getItem("refreshToken");

  const payload = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  };
  const body = await fetch(tokenEndpoint, payload);
  const response = await body.json();

  localStorage.setItem("access_token", response.accessToken);
  if (response.refreshToken) {
    localStorage.setItem("refresh_token", response.refreshToken);
  }
}

//Login button

const loginButton = document.getElementById("spotifyLogin");

loginButton.addEventListener("click", () => {
  redirectToSpotifyAuth();
});

//Refresh Token
async function refreshToken() {
  let accessToken = localStorage.getItem("access_token");

  if (isAccessTokenExpired()) {
    //check token valid
    console.log("Access token expired. Refreshing token...");
    await refreshAccessToken(); // Refresh token if expired
  }
}

//API Calls
const userProfileEndpoint = "https://api.spotify.com/v1/me";

//Get User Profile
async function getUserProfile() {
  try {
    // Refresh token before making the request if needed
    await refreshToken();
    const accessToken = localStorage.getItem("access_token");
    const data = await fetchData(userProfileEndpoint, {
      headers: { Authorization: "Bearer " + accessToken },
    });

    // Save relevant profile data to localStorage
    localStorage.setItem("Id", data.id);
    const userName = data.display_name;
    return userName;
  } catch (error) {
    console.error("Failed to get user profile", error);
  }
}

//Fetch Function
async function fetchData(url) {
  try {
    const accessToken = localStorage.getItem("access_token");
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
}

//Get User's Playlists
async function getUserPlaylists() {
  const userId = localStorage.getItem("Id");
  const playlistsEndpoint = `https://api.spotify.com/v1/users/${userId}/playlists`;
  try {
    // Refresh token before making the request if needed
    await refreshToken();

    const data = await fetchData(playlistsEndpoint);

    console.log(data);
    console.log("Playlists:", data.items);
    return data.items; // Returns the list of playlists
  } catch (error) {
    console.error("Failed to get user playlists", error);
  }
}

//DOM Manipulation
const playlistButton = document.getElementById("getPlaylists");
const myPlaylists = document.getElementById("playlist-grid");

function playlistCardBuilder(playlist) {
  //Build Out Elements of Card
  const card = document.createElement("div");
  card.classList.add("playlist-card");

  const cardBody = document.createElement("div");
  cardBody.classList.add("card-body");

  const img = document.createElement("img");
  img.classList.add("playlist-img");
  if (playlist.images[1] != null) {
    img.setAttribute("src", playlist.images[1].url);
  } else if (playlist.images[0] != null) {
    img.setAttribute("src", playlist.images[0].url);
  } else {
    img.setAttribute("src", "");
  }

  img.setAttribute("alt", "Playlist Mosaic");

  const cardContent = document.createElement("div");
  cardContent.classList.add("card-content");

  const titleContainer = document.createElement("div");
  titleContainer.classList.add("playlist-title-container");

  const PlaylistName = document.createElement("h3");
  PlaylistName.classList.add("playlist-name");
  PlaylistName.textContent = playlist.name;

  const PlaylistDescription = document.createElement("p");
  PlaylistDescription.classList.add("playlist-description");
  PlaylistDescription.textContent = limitString(playlist.description, 50);

  const playlistDetails = document.createElement("div");
  playlistDetails.classList.add("playlist-details");

  const playlistOwner = document.createElement("span");
  playlistOwner.classList.add("playlist-owner");
  playlistOwner.textContent = playlist.owner.display_name;

  const trackCount = document.createElement("span");
  trackCount.classList.add("playlist-track-count");
  trackCount.textContent = `Tracks: ${playlist.tracks.total}`;

  //Put The Card Together (Bottom => Top)

  playlistDetails.append(playlistOwner, trackCount);

  titleContainer.append(PlaylistName, PlaylistDescription);

  cardContent.append(titleContainer, playlistDetails);

  cardBody.append(img, cardContent);
  card.append(cardBody);

  return card;
}

function limitString(str, limit, indicator = "...") {
  if (str.length <= limit) {
    return str;
  } else {
    return str.substring(0, limit) + indicator;
  }
}

playlistButton.addEventListener("click", () =>
  getUserPlaylists().then((data) => {
    for (let i = 0; i < data.length; i++) {
      myPlaylists.append(playlistCardBuilder(data[i]));
    }
  })
);

//Welcome Header
function setupUi(userName) {
  loginModal.classList.add("not-visible");
  const welcomeUser = document.getElementById("welcomeUser");
  welcomeUser.textContent = "Hello, " + userName; //ADD getPLaylists for instant grid onload
}

//NavLinks

const navlink = ".navlink";
const active = "active";

const navlinks = document.querySelectorAll(navlink);

for (const elm of navlinks) {
  elm.addEventListener("click", function () {
    setActive(this, navlink);
  });
}

const setActive = (elm, selector) => {
  const activeElement = document.querySelector(`${selector}.${active}`);
  if (activeElement != null) {
    activeElement.classList.remove(active);
  }
  elm.classList.add(active);
};
