// Spotify API AUTHORIZATION
//var crypto = require("crypto");

const clientId = "327e131484724396b28b9f881dfdd057";
const redirectUrl = "http://localhost:5500/index";

const authorizationEndpoint = "https://accounts.spotify.com/authorize";
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const scope =
  "user-read-private user-read-email user-top-read playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-modify user-library-read ugc-image-upload";
const userProfileEndpoint = "https://api.spotify.com/v1/me";

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
        .then(() => fetchData(userProfileEndpoint))
        .then((data) => {
          localStorage.setItem("Id", data.id);
          loginModal.classList.remove("visible");
          setupUi(data.display_name);
        });
    } else {
      console.error("Code verifier not found.");
    }
  } else {
    checkTokenAndRefresh().then((data) => {
      console.log(data);
      localStorage.setItem("Id", data.id);
      loginModal.classList.remove("visible");
      setupUi(data.display_name);
    });
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
        localStorage.setItem("refresh_token", data.refresh_token);
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
  const refreshToken = localStorage.getItem("refresh_token");

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
  const body = await fetch(tokenEndpoint, payload)
    .then((response) => response.json())
    .then((data) => {
      if (data.accessToken) {
        // Save the new access token in localStorage
        localStorage.setItem("access_token", data.accessToken);
        localStorage.setItem("refresh_token", data.refreshToken);
        console.log("Access token refreshed");
      } else {
        throw new Error("Unable to refresh access token");
      }
    })
    .catch((error) => {
      console.error("Error refreshing access token:", error);
      // Clear tokens and log the user out
      localStorage.clear();
      window.location.reload(); // Refresh the page
    });
}

async function checkTokenAndRefresh() {
  const accessToken = localStorage.getItem("access_token");
  const refreshToken = localStorage.getItem("refresh_token");
  console.log(accessToken, refreshToken);

  // If no access token or refresh token, log the user out
  if (!accessToken || !refreshToken) {
    console.log("No token found. Logging out...");
    localStorage.clear();
    loginModal.classList.add("visible"); // Refresh the page
    return null; // Explicitly return null when no tokens are found
  }

  try {
    const response = await fetchData(userProfileEndpoint);
    if (response) {
      console.log("Token is Valid");
      return response;
    } else {
      throw new Error("Token Invalid or Expired");
    }
  } catch (error) {
    console.error("Token validation failed:", error);
    await getRefreshToken();
    return null;
  }
}

//Login button

const loginButton = document.getElementById("spotifyLogin");

loginButton.addEventListener("click", () => {
  redirectToSpotifyAuth();
});

//Refresh Token
async function refreshToken() {
  if (isAccessTokenExpired()) {
    //check token valid
    console.log("Access token expired. Refreshing token...");
    await getRefreshToken(); // Refresh token if expired
  }
}

//Welcome Header
function setupUi(userName) {
  loginModal.classList.remove("visible");
  const welcomeUser = document.getElementById("welcomeUser");
  welcomeUser.textContent = "Hello, " + userName;
  getUserPlaylists().then((data) => {
    buildDisplayGrid(playlistCardBuilder, data, theGrid);
  });
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
const playlistsArr = [];

async function getUserPlaylists() {
  const userId = localStorage.getItem("Id");
  const playlistsEndpoint = `https://api.spotify.com/v1/users/${userId}/playlists`;
  try {
    // Refresh token before making the request if needed
    await refreshToken();

    const data = await fetchData(playlistsEndpoint);

    console.log("Playlists:", data.items);
    for (let elm of data.items) {
      playlistsArr.push(elm);
    }
    console.log(playlistsArr);
    return data.items; // Returns the list of playlists
  } catch (error) {
    console.error("Failed to get user playlists", error);
  }
}

async function getUserPlaylistById(id) {
  const endpoint = `https://api.spotify.com/v1/playlists/${id}`;

  try {
    const playlistData = await fetchData(endpoint);
    return playlistData;
  } catch (error) {
    console.error("Failed to find playlist", error);
  }
}

//DOM Manipulation
const theGrid = document.getElementById("display-grid");

//playlist Grid
function playlistCardBuilder(playlist) {
  //Get Favorites

  //Build Out Elements of Card
  const card = document.createElement("div");
  card.classList.add("playlist-card");
  card.setAttribute("data-id", playlist.id);
  const cardBody = document.createElement("div");
  cardBody.classList.add("card-body");

  const img = document.createElement("img");
  img.classList.add("playlist-img");
  if (
    playlist.images &&
    playlist.images.length > 1 &&
    playlist.images[1] &&
    playlist.images[1].url
  ) {
    img.setAttribute("src", playlist.images[1].url);
  } else if (
    playlist.images &&
    playlist.images.length > 0 &&
    playlist.images[0] &&
    playlist.images[0].url
  ) {
    img.setAttribute("src", playlist.images[0].url);
  } else {
    img.setAttribute("src", "Assets/Image-not-found.png");
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

  const favoriteBtn = document.createElement("i");
  favoriteBtn.classList.add("fa-regular", "fa-heart", "favoriteBtn");
  favoriteBtn.style.color = "red";

  // favoriteBtn.addEventListener("click", (e) => {
  //   const currentPlaylistFavs =
  //     JSON.parse(localStorage.getItem("favorite-playlists")) || [];
  //   const element = e.target;
  //   const playlistId = element.closest("[data-id]").getAttribute("data-id");
  //   console.log(playlistId);
  //   Check if the playlistId is in the favorites list
  //   if (isFavoritePlaylist(playlistId)) {
  //     // Remove the playlistId from the array
  //     const index = currentPlaylistFavs.indexOf(playlistId);
  //     if (index !== -1) {
  //       currentPlaylistFavs.splice(index, 1); // Remove from the array
  //     }
  //     // Toggle the icon class
  //     element.classList.remove("fa-solid");
  //     element.classList.add("fa-regular");
  //   } else {
  //     // Add the playlistId to the array
  //     if (!currentPlaylistFavs.includes(playlistId)) {
  //       currentPlaylistFavs.push(playlistId); // Only add if not already present
  //     }
  //     // Toggle the icon class
  //     element.classList.remove("fa-regular");
  //     element.classList.add("fa-solid");
  //   }

  //   // Save the updated list back to localStorage
  //   localStorage.setItem(
  //     "favorite-playlists",
  //     JSON.stringify(currentPlaylistFavs)
  //   );
  // })

  if (isFavoritePlaylist(playlist.id)) {
    favoriteBtn.classList.remove("fa-regular");
    favoriteBtn.classList.add("fa-solid");
  }

  //Put The Card Together (Bottom => Top)

  playlistDetails.append(playlistOwner, trackCount);

  titleContainer.append(PlaylistName, PlaylistDescription);

  cardContent.append(favoriteBtn, titleContainer, playlistDetails);

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

const maxDisplayed = 30;

function buildDisplayGrid(
  cardBuilder,
  arr,
  section,
  index = 0,
  maxDisplayed = 30
) {
  console.log(index);

  arr.slice(index, index + maxDisplayed).forEach((item) => {
    section.append(cardBuilder(item));
    console.log(item.name);
  });

  index += maxDisplayed;

  //Load More Logic
  if (index < arr.length) {
    const loadMore = document.createElement("button");
    loadMore.textContent = "Load More";
    loadMore.classList.add("load-more", "btn");
    section.appendChild(loadMore);

    // Add an event listener for the "Load More" button
    loadMore.addEventListener("click", () => {
      buildDisplayGrid(cardBuilder, arr, section, index, maxDisplayed);
      loadMore.remove(); // Remove the "Load More" button after clicking
    });
  }
}
//PLaylist Track Modal

function tracklistModalBuilder(playlist) {
  const tracklistModal = document.createElement("div");
  tracklistModal.classList.add("tracklist-modal");
  tracklistModal.setAttribute("data-id", playlist.id);
  tracklistModal.setAttribute("id", playlist.id);

  // Tracklist Head
  const tracklistHeadContainer = document.createElement("div");
  tracklistHeadContainer.classList.add("tracklist-head-container");

  const headImgWrapper = document.createElement("div");
  headImgWrapper.classList.add("head-img-wrapper");

  const headImg = document.createElement("img"); // playlist Img
  headImg.classList.add("playlist-head-img");
  if (
    playlist.images &&
    playlist.images.length > 1 &&
    playlist.images[1] &&
    playlist.images[1].url
  ) {
    headImg.setAttribute("src", playlist.images[1].url);
  } else if (
    playlist.images &&
    playlist.images.length > 0 &&
    playlist.images[0] &&
    playlist.images[0].url
  ) {
    headImg.setAttribute("src", playlist.images[0].url);
  } else {
    headImg.setAttribute("src", "Assets/Image-not-found.png");
  }

  headImg.setAttribute("alt", "Playlist Mosaic");

  headImgWrapper.append(headImg);

  const headContentContainer = document.createElement("div");
  headContentContainer.classList.add("head-content-container");

  const headerTitleContainer = document.createElement("div"); // Title Container
  headerTitleContainer.classList.add("header-title-container");
  const playlistTitle = document.createElement("h3"); // Title
  playlistTitle.textContent = playlist.name; // Assuming playlist has a name property
  const favoriteBtn = document.createElement("i");
  favoriteBtn.classList.add("fa-regular", "fa-heart", "favoriteBtn"); // Favorite Button
  favoriteBtn.style.color = "red";

  if (isFavoritePlaylist(playlist.id)) {
    favoriteBtn.classList.remove("fa-regular");
    favoriteBtn.classList.add("fa-solid");
  }

  const closeIcon = document.createElement("i");
  closeIcon.classList.add("fas", "fa-times", "closeBtn");
  closeIcon.setAttribute("data-close", "");

  headerTitleContainer.append(playlistTitle, favoriteBtn, closeIcon);

  const headBodyContainer = document.createElement("div");
  headBodyContainer.classList.add("head-body-container");

  const headBodyLeft = document.createElement("div"); // LEFT
  headBodyLeft.classList.add("head-body-left");
  const owner = document.createElement("span");
  owner.textContent = "Owner: " + playlist.owner.display_name; // Owner name
  const trackCount = document.createElement("span");
  trackCount.textContent = "tracks: " + playlist.tracks.total; // Track Count

  headBodyLeft.append(owner, trackCount);

  const headBodyRight = document.createElement("div"); // RIGHT
  headBodyRight.classList.add("head-body-right");
  const followers = document.createElement("span");
  followers.textContent = "Followers: " + playlist.followers.total; // Followers
  const publicFlag = document.createElement("span");
  const isPublic = (x) => {
    if (playlist.public === false) {
      publicFlag.textContent = "Private"; // Private
    } else {
      publicFlag.textContent = "Public"; // Public
    }
  };
  isPublic(playlist.public);

  // Build Tracklist Head
  headBodyRight.append(followers, publicFlag);

  headBodyContainer.append(headBodyLeft, headBodyRight);

  headContentContainer.append(headerTitleContainer, headBodyContainer);

  tracklistHeadContainer.append(headImgWrapper, headContentContainer);

  // Tracklist Body
  const tracklistContainer = document.createElement("div");
  tracklistContainer.classList.add("tracklist-container");

  const tracklist = playlist.tracks.items;
  console.log(tracklist);

  tracklist.forEach((track) =>
    tracklistContainer.appendChild(buildTrackItem(track))
  );

  // Construct Modal
  tracklistModal.append(tracklistHeadContainer, tracklistContainer);

  return tracklistModal;
}

function buildTrackItem(track) {
  const trackContainer = document.createElement("div");
  trackContainer.classList.add("track-container");
  if (track.track) {
    const trackImgWrapper = document.createElement("div");
    trackImgWrapper.classList.add("track-img-wrapper");

    const trackImg = document.createElement("img");
    trackImg.classList.add("track-img");
    if (
      track.track && // Check if track.track is defined
      track.track.album && // Check if track.track.album is defined
      track.track.album.images && // Check if images array exists
      Array.isArray(track.track.album.images) && // Check if images is an array
      track.track.album.images.length > 1 && // Check if there are at least 2 images
      track.track.album.images[1] && // Ensure the second image exists
      track.track.album.images[1].url // Ensure the second image has a URL
    ) {
      trackImg.setAttribute("src", track.track.album.images[1].url);
    } else if (
      track.track && // Check if track.track is defined
      track.track.album && // Check if track.track.album is defined
      track.track.album.images && // Check if images array exists
      Array.isArray(track.track.album.images) && // Check if images is an array
      track.track.album.images.length > 0 && // Check if there is at least 1 image
      track.track.album.images[0] && // Ensure the first image exists
      track.track.album.images[0].url // Ensure the first image has a URL
    ) {
      trackImg.setAttribute("src", track.track.album.images[0].url);
    } else {
      trackImg.setAttribute("src", "Assets/Image-not-found.png");
    }

    trackImg.setAttribute("alt", "Track Image");

    trackImgWrapper.append(trackImg);

    const trackContentContainer = document.createElement("div");
    trackContentContainer.classList.add("track-content-container");

    const trackInfo = document.createElement("div");
    trackInfo.classList.add("track-info");
    const trackTitle = document.createElement("span");
    trackTitle.textContent = track.track.name;
    const trackArtist = document.createElement("span");
    trackArtist.textContent = track.track.artists
      .map((artist) => artist.name)
      .join(", ");
    const trackAlbum = document.createElement("span");
    trackAlbum.textContent = track.track.album.name;

    trackInfo.append(trackTitle, trackArtist, trackAlbum);

    const trackData = document.createElement("div");
    trackData.classList.add("track-data");

    const trackLength = document.createElement("span");
    const trackDurationSeconds = track.track.duration_ms / 1000; // Fix: Correct duration field
    const trackDurationRemainder = trackDurationSeconds % 60;
    trackLength.textContent = `${Math.floor(
      trackDurationSeconds / 60
    )}:${trackDurationRemainder.toString().padStart(2, "0")}`;

    trackData.append(trackLength);

    trackContentContainer.append(trackInfo, trackData);

    trackContainer.append(trackImgWrapper, trackContentContainer);
    return trackContainer;
  } else {
    const errorMessage = document.createElement("span");
    errorMessage.textContent = "Unable to Find this Track :(";
    trackContainer.append(errorMessage);
    return trackContainer;
  }
}

//NavLinks

const navlink = ".navlink";
const active = "active";

const navlinks = document.querySelectorAll(navlink);

for (const elm of navlinks) {
  elm.addEventListener("click", () => {
    if (elm.classList.contains(active)) {
      return; // Do nothing if already active
    }
    theGrid.innerHTML = "";

    setActive(elm, navlink);
    const linkId = elm.id;
    if (linkId === "getPlaylists") {
      if (playlistsArr.length === 0) {
        noResultsMessage(theGrid, "Try creating some playlists!");
      }
      buildDisplayGrid(playlistCardBuilder, playlistsArr, theGrid);
    } else if (linkId === "getFavorites") {
      const currentFavorites =
        JSON.parse(localStorage.getItem("favorite-playlists")) || [];
      if (currentFavorites.length === 0) {
        noResultsMessage(theGrid, "Try adding some playlists to Favorites!");
      }
      const displayFavsArray = playlistsArr.filter((playlist) =>
        filterByFavorite(playlist, currentFavorites)
      );
      buildDisplayGrid(playlistCardBuilder, displayFavsArray, theGrid);
    }
  });
}

function filterByFavorite(playlist, favArr) {
  for (let id of favArr) {
    if (playlist.id === id) {
      return true;
    }
  }
  return false;
}

const setActive = (elm, selector) => {
  const activeElement = document.querySelector(`${selector}.${active}`);
  if (activeElement != null) {
    activeElement.classList.remove(active);
  }
  elm.classList.add(active);
};

//Empty Set Notification

function noResultsMessage(section, message) {
  //let's user know there are no results
  const messageBox = document.createElement("div");
  messageBox.classList.add("no-results");
  messageBox.textContent = `Uh-Oh! Looks like there's nothing here! ${message}`;

  section.append(messageBox);
}

//Favorite Button

// Check if a playlist is marked as favorite
function isFavoritePlaylist(id) {
  const currentPlaylistFavs =
    JSON.parse(localStorage.getItem("favorite-playlists")) || [];
  return currentPlaylistFavs.includes(id);
}

document.body.addEventListener("click", function (e) {
  // Check if the clicked element is a favorite button
  const element = e.target;
  if (element.closest(".favoriteBtn")) {
    e.stopPropagation();
    const currentPlaylistFavs =
      JSON.parse(localStorage.getItem("favorite-playlists")) || [];

    const playlist = e.target.closest("[data-id]");
    const playlistId = playlist.getAttribute("data-id");

    console.log(playlistId);

    if (isFavoritePlaylist(playlistId)) {
      const index = currentPlaylistFavs.indexOf(playlistId);
      if (index !== -1) {
        currentPlaylistFavs.splice(index, 1);
      }

      element.classList.remove("fa-solid");
      element.classList.add("fa-regular");
    } else {
      if (!currentPlaylistFavs.includes(playlistId)) {
        currentPlaylistFavs.push(playlistId);
      }

      element.classList.remove("fa-regular");
      element.classList.add("fa-solid");
    }

    localStorage.setItem(
      "favorite-playlists",
      JSON.stringify(currentPlaylistFavs)
    );
  } else if (element.closest(".playlist-card")) {
    const playlistId = element.closest("[data-id]").getAttribute("data-id");
    getUserPlaylistById(playlistId)
      .then((playlist) => {
        console.log(playlist);
        const playlistModal = tracklistModalBuilder(playlist);
        document.body.append(playlistModal);
        return playlistModal;
      })
      .then((modal) => {
        modal.classList.add("is-visible");
      });
  } else if (element.closest(".closeBtn")) {
    element.closest(".tracklist-modal").remove();
  }
});
