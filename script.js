// ================= PRODUCTS =================
window.currentUser = null;
console.log("SCRIPT LOADED");
let cart = [];
let currentRoom = "";
let currentProvider = "";
let currentChatProviderRole = "";
let editingProductId = null;
let editingProviderId = null;

const API_BASE_CANDIDATES = (() => {
  return [
    "https://fix-hub-backend.onrender.com"
  ];
})();
let resolvedApiBase = null;
const API_RESPONSE_CACHE = new Map();
const API_CACHE_TTL_MS = 5000;

function getPersistedCache(key, ttlMs = 5 * 60 * 1000) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - parsed.savedAt > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.value;
  } catch (err) {
    return null;
  }
}

function setPersistedCache(key, value) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        value,
        savedAt: Date.now(),
      }),
    );
  } catch (err) {
    console.warn("Failed to save cache:", err);
  }
}

function normalizeArrayData(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function getRuntimeApiBase() {
  const protocol = window.location?.protocol || "http:";
  const hostname = window.location?.hostname || "localhost";
  const normalizedHostname = hostname === "0.0.0.0" ? "localhost" : hostname;
  return `${protocol}//${normalizedHostname}:3000`;
}

function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

async function getApiBase() {
  if (resolvedApiBase) return resolvedApiBase;

  // Prioritize your live deployment link explicitly over local fallbacks
  const productionBase = "https://fix-hub-backend.onrender.com";
  const runtimeBase = getRuntimeApiBase();
  
  const candidateBases = Array.from(
    new Set([productionBase, runtimeBase, ...API_BASE_CANDIDATES])
  );

  const probeBase = async (base) => {
    // Increase probe limit to 2500ms to allow your cloud server to shake off latency
    const timeoutLimit = base.includes("onrender.com") ? 4000 : 1500;
    
    const response = await fetchWithTimeout(
      `${base}/`,
      {
        method: "GET",
      },
      timeoutLimit
    );

    if (response.ok || response.status === 404 || response.status < 500) {
      return base;
    }

    throw new Error(`Probe returned ${response.status}`);
  };

  try {
    resolvedApiBase = await Promise.any(
      candidateBases.map(async (base) => {
        try {
          return await probeBase(base);
        } catch (err) {
          throw err;
        }
      })
    );
    console.log("🎯 CONNECTED TO API BASE:", resolvedApiBase);
    return resolvedApiBase;
  } catch (err) {
    console.warn("API base probe failed for all candidates, hard-falling back to production", err);
    // If everything fails, hard-default to your live internet server, not localhost!
    resolvedApiBase = productionBase;
    return resolvedApiBase;
  }
}

async function apiFetch(path, options = {}) {
  const base = await getApiBase();
  const token = localStorage.getItem("token");
  const headers = {
    ...(options.headers || {}),
  };

  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = token;
  }

  const method = String(options.method || "GET").toUpperCase();
  const requestUrl = `${base}${path}`;
  const cacheKey = `${method}:${requestUrl}`;

  if (method === "GET" && !options.skipCache) {
    const cached = API_RESPONSE_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < API_CACHE_TTL_MS) {
      return cached.response.clone();
    }
  }

  // 🔥 FIX: Check if the payload is a file upload to extend timeout threshold
  const isFormData = options.body instanceof FormData;
  const timeoutDuration = isFormData ? 30000 : 8000; // 30 seconds for image files, 8 for text data

  const response = await fetchWithTimeout(
    requestUrl,
    {
      ...options,
      headers,
    },
    timeoutDuration // 👈 Dynamic threshold assigned here
  );

  if (method === "GET" && response.ok && !options.skipCache) {
    API_RESPONSE_CACHE.set(cacheKey, {
      timestamp: Date.now(),
      response: response.clone(),
    });
  }

  return response;
}

const originalFetch = window.fetch.bind(window);
window.fetch = async function (input, init) {
  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : String(input || "");

  if (typeof requestUrl === "string") {
    // Catch every possible local variation along with old Render URLs
    const liveBase = await getApiBase();
    const rewrittenUrl = requestUrl
      .replace("http://localhost:3000", liveBase)
      .replace("http://127.0.0.1:3000", liveBase)
      .replace("localhost:3000", liveBase)
      .replace("127.0.0.1:3000", liveBase)
      .replace("https://fix-hub-esw3.onrender.com", liveBase);

    const rewrittenInput =
      typeof input === "string"
        ? rewrittenUrl
        : new Request(rewrittenUrl, input);

    return originalFetch(rewrittenInput, init);
  }

  return originalFetch(input, init);
};
window.loadCart = function () {
  const user = getCurrentUserState();

  if (!user?.email) return Promise.resolve([]);

  const cacheKey = `fixhub_cart_cache_${user.email}`;
  const cachedCart = getPersistedCache(cacheKey, 2 * 60 * 1000);

  if (Array.isArray(cachedCart)) {
    cart = cachedCart;
    updateCartCount();
    renderCart();
  }

  return apiFetch(`/cart/${user.email}`)
    .then((res) => res.json())
    .then((data) => {
      const items = normalizeArrayData(data?.items || data);
      cart = items;
      setPersistedCache(cacheKey, items);
      updateCartCount();
      renderCart();
      return cart;
    })
    .catch((err) => {
      console.error("LOAD CART ERROR:", err);
      return cart;
    });
};

function getStoredSessionUser() {
  const token = localStorage.getItem("token");
  const storedUser = JSON.parse(localStorage.getItem("currentUser") || "null");

  if (!token || !storedUser?.email) return null;
  return storedUser;
}

function getCurrentUserState() {
  return window.currentUser || getStoredSessionUser();
}

function getUserRole() {
  return getCurrentUserState()?.role || "Guest";
}

function updateUserUI() {
  const userInfo = document.getElementById("user-info");
  if (!userInfo) return;

  const isGuestPage = window.location.pathname
    .toLowerCase()
    .endsWith("guest.html");
  const forceGuest =
    isGuestPage ||
    new URLSearchParams(window.location.search).get("guest") === "1";

  if (forceGuest) {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    currentUser = null;
    window.currentUser = null;
    userInfo.innerText = "Guest";
    applyRoleUI();
    syncAuthNavUI();
    return;
  }

  const token = localStorage.getItem("token");
  const storedUser = JSON.parse(localStorage.getItem("currentUser") || "null");

  // Only allow session if both token and storedUser are present and valid
  if (!token || !storedUser || !storedUser.email) {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    currentUser = null;
    window.currentUser = null;
    userInfo.innerText = "Guest";
    applyRoleUI();
    syncAuthNavUI();
    return;
  }

  let payload = null;
  try {
    payload = JSON.parse(atob(token.split(".")[1]));
  } catch (e) {
    // Invalid token
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    currentUser = null;
    window.currentUser = null;
    userInfo.innerText = "Guest";
    applyRoleUI();
    syncAuthNavUI();
    return;
  }

  currentUser = {
    ...storedUser,
    name: storedUser?.name || payload.name || payload.email,
    role: storedUser?.role || payload.role || "Customer",
    email: storedUser?.email || payload.email,
  };

  window.currentUser = currentUser;
  localStorage.setItem("currentUser", JSON.stringify(currentUser));

  userInfo.innerText = `${currentUser.name} (${currentUser.role})`;
  applyRoleUI();
  syncAuthNavUI();
}

function syncAuthNavUI() {
  const currentUserState = getCurrentUserState();
  const hasUser = !!currentUserState?.email;

  document
    .querySelectorAll("a.auth-action, button.auth-action")
    .forEach((el) => {
      el.style.display = hasUser ? "none" : "";
    });

  const userInfo = document.getElementById("user-info");
  if (userInfo) {
    userInfo.innerText = hasUser
      ? `${currentUserState.name || currentUserState.email} (${currentUserState.role || "Customer"})`
      : "Guest";
  }

  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.style.display = hasUser ? "inline-flex" : "none";
  }
}

window.handleLogout = function () {
  localStorage.removeItem("token");
  localStorage.removeItem("currentUser");
  window.currentUser = null;
  updateUserUI();
  window.location.href = "index.html";
};

// ================= CART =================

window.currentCategory = "all";

window.filterCategory = function (category) {
  const normalizedCategory = String(category || "all")
    .trim()
    .toLowerCase();
  window.currentCategory = normalizedCategory;

  loadProducts(normalizedCategory === "all" ? "" : normalizedCategory);
  loadServices(normalizedCategory === "all" ? "" : normalizedCategory);
};

function renderProductCards(products, providers, filter = "") {
  const currentUser = getCurrentUserState();
  const providerMap = new Map(
    providers.map((provider) => [normalizeEmail(provider.owner), provider]),
  );

  const container = getActiveCatalogContainer("products");
  if (!container) {
    console.error("products-container missing in HTML");
    return [];
  }

  container.innerHTML = "";

  const role = getUserRole();
  let productList = products.filter((p) => {
    const provider = providerMap.get(normalizeEmail(p.owner));
    return provider && String(provider.role || "").toLowerCase() === "seller";
  });

  if (role === "Seller" && currentUser?.email) {
    productList = productList.filter(
      (p) =>
        p.owner && p.owner.toLowerCase() === currentUser.email.toLowerCase(),
    );
  }

  if (!productList.length) {
    container.innerHTML = `
      <div class="col-12 text-center py-4 text-muted">
        No products available right now.
      </div>
    `;
    return [];
  }

  if (window.currentCategory && window.currentCategory !== "all") {
    const category = String(window.currentCategory || "").toLowerCase();
    productList = productList.filter((p) => {
      const sellerProvider = providerMap.get(normalizeEmail(p.owner)) || {};
      return (
        matchesFilterTerm(p?.name, category) ||
        matchesFilterTerm(p?.description, category) ||
        matchesFilterTerm(sellerProvider?.specialty, category) ||
        matchesFilterTerm(sellerProvider?.role, category)
      );
    });
  }

  productList.forEach((p) => {
    const sellerProvider = providerMap.get(normalizeEmail(p.owner)) || null;
    const sellerBadge =
      sellerProvider?.badge || getProviderBadge(sellerProvider || {});
    const sellerRating = Number(sellerProvider?.ratingAvg || 0).toFixed(1);
    const sellerCount = sellerProvider?.ratingCount || 0;
    const userRole = currentUser?.role || "Guest";

    if (!p.name || p.price === undefined || p.price === null) return;

    if (filter && !matchesFilterTerm(p?.name, filter)) {
      const sellerProvider = providerMap.get(normalizeEmail(p.owner)) || {};
      if (
        !matchesFilterTerm(p?.description, filter) &&
        !matchesFilterTerm(sellerProvider?.specialty, filter) &&
        !matchesFilterTerm(sellerProvider?.role, filter)
      ) {
        return;
      }
    }

    container.innerHTML += `
      <div class="col-md-4 mb-4">
        <div class="card shadow-sm">
          <img loading="lazy"
            src="${getUploadImageUrl(p.image)}"
            alt="${p.name || "Product image"}"
            style="height:200px; object-fit:cover;"
          >
          <div class="card-body">
            <h5>${p.name}</h5>
            <p class="text-success fw-bold">${p.price} ETB</p>
            <div class="mb-2">
              <span class="badge bg-warning text-dark">${sellerBadge}</span>
              <span class="ms-2 text-muted">⭐ ${sellerRating} (${sellerCount} ratings)</span>
            </div>
            ${
              canRateProviders(currentUser) && sellerProvider
                ? `<div class="mb-2 text-warning">${renderRatingStars(sellerProvider, currentUser)}</div>
                   <small class="text-muted">Hover to preview and click a star to rate this seller</small>`
                : ""
            }
            ${
              userRole === "Customer"
                ? `
                  <button class="btn btn-primary w-100"
                    onclick='openProductDetail(${JSON.stringify(p)})'>
                    View Details
                  </button>
                  <button class="btn btn-success w-100 mt-2"
                    onclick="addToCart('${p._id}')">
                    Add to Cart
                  </button>
                  <button class="btn btn-dark w-100 mt-2"
                    onclick="openChat('${p.owner}')">
                    Chat Seller
                  </button>
                `
                : userRole === "Guest"
                  ? `
                    <button class="btn btn-primary w-100" onclick="requireLogin('Please log in or sign up first to view details.')">View Details</button>
                    <button class="btn btn-success w-100 mt-2" onclick="requireLogin('Please log in or sign up first to add items to your cart.')">Add to Cart</button>
                    <button class="btn btn-dark w-100 mt-2" onclick="requireLogin('Please log in or sign up first to chat or hire.')">Chat Seller</button>
                  `
                  : ""
            }
            ${
              currentUser?.role === "Seller"
                ? `
                  <button class="btn btn-warning w-100 mt-2" onclick="editProduct('${p._id}')">Edit</button>
                  <button class="btn btn-danger w-100 mt-2" onclick="deleteProduct('${p._id}')">Delete</button>
                `
                : ""
            }
          </div>
        </div>
      </div>
    `;
  });

  return productList;
}

window.loadProducts = function (filter = "") {
  const cachedProducts = getPersistedCache("fixhub_products_cache");
  const cachedProviders = getPersistedCache("fixhub_providers_cache");

  if (Array.isArray(cachedProducts) && Array.isArray(cachedProviders)) {
    renderProductCards(cachedProducts, cachedProviders, filter);
  }

  return Promise.all([
    apiFetch("/products", {
      headers: {
        Authorization: localStorage.getItem("token"),
      },
    }),
    apiFetch("/providers"),
  ])
    .then(async ([productsRes, providersRes]) => {
      const data = await productsRes.json();
      const providersData = await providersRes.json();
      const products = normalizeArrayData(data);
      const providers = normalizeArrayData(providersData);

      setPersistedCache("fixhub_products_cache", products);
      setPersistedCache("fixhub_providers_cache", providers);
      window.loadedProducts = products;
      window.loadedServices = providers;
      return renderProductCards(products, providers, filter);
    })
    .catch((err) => {
      console.error("PRODUCT ERROR:", err);
      const container = getActiveCatalogContainer("products");
      if (container) {
        container.innerHTML = "";
        FALLBACK_PRODUCTS.forEach((p) => {
          container.innerHTML += `
            <div class="col-md-4 mb-4">
              <div class="card shadow-sm">
                <img loading="lazy" src="${getUploadImageUrl(p.image)}" alt="${p.name}" style="height:200px; object-fit:cover;">
                <div class="card-body">
                  <h5>${p.name}</h5>
                  <p class="text-success fw-bold">${p.price} ETB</p>
                  <button class="btn btn-primary w-100" onclick="requireLogin('Please log in or sign up first to view details.')">View Details</button>
                  <button class="btn btn-success w-100 mt-2" onclick="requireLogin('Please log in or sign up first to add items to your cart.')">Add to Cart</button>
                  <button class="btn btn-dark w-100 mt-2" onclick="requireLogin('Please log in or sign up first to chat or hire.')">Chat Seller</button>
                </div>
              </div>
            </div>`;
        });
      }
      return [];
    });
};
window.deleteProduct = function (productId) {
  const confirmed = confirm("⚠️ Are you sure you want to delete this product?");

  if (!confirmed) {
    showToast("Delete cancelled");
    return;
  }

  apiFetch(`/products/${productId}`, {
    method: "DELETE",
  })
    .then((res) => res.json())
    .then((data) => {
      console.log("DELETE RESPONSE:", data);

      showToast("Product deleted successfully ✅", "success");
      loadProducts();
    })
    .catch((err) => {
      console.log(err);
      showToast("Delete failed ❌", "error");
    });
};
window.editProduct = function (productId) {
  apiFetch("/products")
    .then((res) => res.json())
    .then((products) => {
      const product = products.find((p) => p._id === productId);

      if (!product) return showToast("Product not found ❌");

      editingProductId = productId;

      document.getElementById("edit-name").value = product.name;
      document.getElementById("edit-price").value = product.price;
      document.getElementById("edit-details").value =
        product.details || product.description || "";

      const modal = new bootstrap.Modal(
        document.getElementById("editProductModal"),
      );

      modal.show();
    });
};
window.saveProductEdit = function () {
  const productDetail = document.getElementById("edit-details").value.trim();

  const updatedProduct = {
    name: document.getElementById("edit-name").value,
    price: document.getElementById("edit-price").value,
    description: productDetail,
    details: productDetail,
  };

  apiFetch(`/products/${editingProductId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updatedProduct),
  })
    .then((res) => res.json())
    .then((data) => {
      showToast("Product updated successfully ✅", "success");

      bootstrap.Modal.getInstance(
        document.getElementById("editProductModal"),
      ).hide();

      loadProducts();
    })
    .catch((err) => {
      console.log(err);
      showToast("Update failed ❌", "error");
    });
};
window.addToCart = function (id) {
  if (
    !requireLogin("Please log in or sign up first to add items to your cart.")
  )
    return;

  apiFetch("/products")
    .then((res) => res.json())
    .then((products) => {
      const product = products.find((p) => p._id === id);

      if (!product) {
        showToast("Product not found ❌");
        return;
      }

      const user = JSON.parse(localStorage.getItem("currentUser"));

      apiFetch("/cart/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.email,
          product: {
            productId: product._id,
            name: product.name,
            price: product.price,
            image: product.image,
            qty: 1,
          },
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          cart = data.items;
          updateCartCount();
          renderCart();
          showToast("Added to cart ✅", "success");
        });
    });
};
function renderCart() {
  const container = document.getElementById("cart-items");

  if (!container) return;

  container.innerHTML = "";

  let total = 0;

  cart.forEach((item, index) => {
    total += Number(item.price);

    container.innerHTML += `
      <div class="card p-2 mb-2 d-flex flex-row align-items-center gap-3">

       <img loading="lazy" src="${getUploadImageUrl(item.image)}"
         alt="${item.name || "Cart item image"}"
         style="width:70px; height:70px; object-fit:cover;">

        <div class="flex-grow-1">
          <h6>${item.name}</h6>
          <p class="m-0">${item.price} ETB</p>
        </div>

        <button class="btn btn-danger btn-sm"
         onclick="removeFromCart('${item.productId}')">
          Remove
        </button>

      </div>
    `;
  });

  container.innerHTML += `
    <hr>
    <h4>Total: ${total} ETB</h4>
  `;

  // show or hide BNPL button in cart modal depending on cart contents
  const cartBnplBtn = document.getElementById("cart-bnpl-btn");
  if (cartBnplBtn) {
    cartBnplBtn.style.display =
      Array.isArray(cart) && cart.length > 0 ? "" : "none";
  }
}
window.removeFromCart = function (productId) {
  const user = JSON.parse(localStorage.getItem("currentUser"));

  apiFetch("/cart/remove", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: user.email,
      productId: productId,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      cart = data.items || [];
      updateCartCount();
      renderCart();
      showToast("Removed from cart ❌", "success");
    })
    .catch((err) => console.error(err));
};
window.openCart = function () {
  if (!requireLogin("Please log in or sign up first to view your cart."))
    return;

  const user = getCurrentUserState();

  if (!user) {
    showToast("Please log in or sign up first to view your cart.", "error");
    return;
  }

  apiFetch(`/cart/${user.email}`)
    .then((res) => res.json())
    .then((data) => {
      cart = data.items || [];
      updateCartCount();
      renderCart();

      const modal = new bootstrap.Modal(document.getElementById("cartModal"));

      modal.show();
    })
    .catch((err) => {
      console.log("CART ERROR:", err);
    });
};

window.openBNPLFromCart = function () {
  if (!requireLogin("Please log in or sign up first to view BNPL.")) return;

  const modalEl = document.getElementById("bnplModal");
  const body = document.getElementById("bnpl-modal-body");
  if (body) {
    const existing = body.querySelector(".bnpl-product-name");
    const summary = `Cart items: ${Array.isArray(cart) ? cart.length : 0} · Total: ${cart.reduce((s, i) => s + Number(i.price || 0), 0)} ETB`;
    if (!existing) {
      const p = document.createElement("p");
      p.className = "bnpl-product-name mb-2";
      p.innerText = summary;
      body.insertBefore(p, body.firstChild);
    } else {
      existing.innerText = summary;
    }
  }

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
};
function matchesFilterTerm(value, query) {
  const text = String(value || "").toLowerCase();
  const term = String(query || "")
    .trim()
    .toLowerCase();

  if (!term || term === "all") return true;

  return text.includes(term);
}

const FALLBACK_PRODUCTS = [];

const FALLBACK_PROVIDERS = [];

function getUploadImageUrl(
  image,
  fallback = "https://placehold.co/600x400/111827/ffffff?text=FixHub",
) {
  const name = String(image || "").trim();

  if (!name || name === "image.jpg" || name === "default.jpg") {
    return fallback;
  }

  if (/^https?:\/\//i.test(name) || name.startsWith("data:")) {
    return name;
  }

  // If a CDN base is configured on the client (window.CDN_BASE), prefer it
  try {
    const cdn = (window.CDN_BASE || "").toString().trim();
    if (cdn) {
      return `${cdn.replace(/\/$/, "")}/uploads/${encodeURIComponent(name)}`;
    }
  } catch (e) {
    // ignore and fall back
  }

  return `${getRuntimeApiBase()}/uploads/${encodeURIComponent(name)}`;
}

function renderProviderCard(provider) {
  const currentUser = getCurrentUserState();
  const isOwnTechnicianService =
    currentUser?.role === "Technician" &&
    normalizeEmail(provider.owner || provider.userEmail) ===
      normalizeEmail(currentUser?.email);

  return `
    <div class="col-md-4 mb-4">
      <div class="card h-100 shadow-sm">

       <img loading="lazy" src="${getUploadImageUrl(provider.image)}"
     alt="${provider.name || "Provider image"}"
     style="height:200px; object-fit:cover;">

        <div class="card-body">

          <h5>${provider.name}</h5>

          <span class="badge bg-dark mb-2">
            ${provider.role}
          </span>

          <p><strong>Specialty:</strong> ${provider.specialty}</p>
          <p><strong>Location:</strong> ${provider.location}</p>
          <div class="mb-2">
            <span class="badge bg-warning text-dark">${provider.badge || getProviderBadge(provider)}</span>
            <span class="ms-2 text-muted">⭐ ${Number(provider.ratingAvg || 0).toFixed(1)} (${provider.ratingCount || 0} ratings)</span>
          </div>

          ${provider.price ? `<p><strong>Price:</strong> ${provider.price} ETB</p>` : ""}

          ${
            isOwnTechnicianService
              ? ""
              : window.currentUser?.role === "Customer"
                ? `<button class="btn btn-outline-dark w-100 mt-2 chat-btn" data-name="${provider.name}">💬 Chat / Hire</button>`
                : ""
          }

          <button class="btn btn-primary w-100 mt-2" onclick='openServiceDetail(${JSON.stringify(provider)})'>View Details</button>

          ${
            isOwnTechnicianService
              ? `
                  <button class="btn btn-warning w-100 mt-2" onclick="editProvider('${provider._id || provider.id}')">Edit</button>
                  <button class="btn btn-danger w-100 mt-2" onclick="deleteProvider('${provider._id || provider.id}')">Delete</button>
                `
              : ""
          }

        </div>
      </div>
    </div>
  `;
}

function updateCartCount() {
  const el = document.getElementById("cart-count");
  if (!el) return;
  el.innerText = cart.length;
}

function requireLogin(message = "Please log in or sign up first") {
  const token = localStorage.getItem("token");
  const user = getCurrentUserState();

  if (!token || !user?.email) {
    const redirectTo = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    showToast(message, "error");
    window.location.href = `login.html?redirect=${redirectTo}`;
    return false;
  }
  return true;
}

function getActiveCatalogContainer(type) {
  const catalogView = document.getElementById("catalog-view");
  const homeView = document.getElementById("home-view");

  const catalogVisible =
    !!catalogView &&
    (catalogView.style.display === "block" ||
      window.getComputedStyle(catalogView).display !== "none");

  const homeVisible =
    !!homeView &&
    (homeView.style.display === "block" ||
      window.getComputedStyle(homeView).display !== "none");

  if (catalogVisible) {
    return (
      document.getElementById(
        type === "products"
          ? "catalog-products-container"
          : "catalog-services-container",
      ) ||
      document.getElementById(
        type === "products" ? "products-container" : "services-container",
      )
    );
  }

  if (homeVisible) {
    return (
      document.getElementById(
        type === "products" ? "products-container" : "services-container",
      ) ||
      document.getElementById(
        type === "products"
          ? "catalog-products-container"
          : "catalog-services-container",
      )
    );
  }

  return (
    document.getElementById(
      type === "products" ? "products-container" : "services-container",
    ) ||
    document.getElementById(
      type === "products"
        ? "catalog-products-container"
        : "catalog-services-container",
    )
  );
}
window.checkout = function () {
  if (!requireLogin("Please log in or sign up first to checkout.")) return;

  if (cart.length === 0) {
    showToast("Cart is empty ❌");
    return;
  }

  const customerEmail = window.currentUser?.email;
  const productIds = cart.map((item) => item.productId).filter(Boolean);

  if (productIds.length > 0 && customerEmail) {
    apiFetch("/notifications/cart/clear", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerEmail,
        productIds,
      }),
    }).catch((err) => {
      console.error("Failed to clear cart notifications:", err);
    });
  }

  let total = cart.reduce((sum, item) => sum + Number(item.price), 0);

  const orderId = "FIXHUB_" + Date.now();

  apiFetch("/payment/initialize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: total,
      email: customerEmail,
      orderId: orderId,
      items: cart,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      const checkoutUrl = data.data.checkout_url;
      window.location.href = checkoutUrl;
    })
    .catch((err) => {
      console.log(err);
      showToast("Payment failed ❌");
    });
};

function showNotification(message) {
  const n = document.createElement("div");
  n.innerText = message;
  n.className = "notification";
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2000);
}
function showPage(page) {
  document.querySelectorAll("section, div").forEach((el) => {
    if (el.id === page) el.style.display = "block";
    else if (el.id.includes("view") || el.id.includes("detail")) {
      el.style.display = "none";
    }
  });
}

// ================= PROVIDERS =================

const BADGE_LIMITS = {
  topRated: 4.8,
  highlyRated: 4.5,
  trusted: 4.0,
};

function getProviderBadge(provider) {
  const avg = Number(provider?.ratingAvg || 0);
  if (avg >= BADGE_LIMITS.topRated) return "Top Rated";
  if (avg >= BADGE_LIMITS.highlyRated) return "Highly Rated";
  if (avg >= BADGE_LIMITS.trusted) return "Trusted";
  return "New";
}

function canRateProviders(currentUser) {
  return String(currentUser?.role || "").toLowerCase() === "customer";
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getUserRatingScore(provider, currentUser) {
  const userEmail = normalizeEmail(currentUser?.email);
  if (!userEmail || !Array.isArray(provider?.ratings)) return 0;

  const rating = provider.ratings.find(
    (item) => normalizeEmail(item?.userEmail) === userEmail,
  );
  return Number(rating?.score || 0);
}

function renderRatingStars(provider, currentUser) {
  const providerId = provider?._id || provider?.id;
  const selectedScore = getUserRatingScore(provider, currentUser);

  const stars = [1, 2, 3, 4, 5]
    .map(
      (score) => `
        <button
          type="button"
          class="rating-star-btn ${score <= selectedScore ? "active" : ""}"
          data-score="${score}"
          onclick="submitProviderRating('${providerId}', ${score})"
          title="${score <= selectedScore ? `You rated ${score} out of 5` : `Rate ${score} out of 5`}"
        >★</button>
      `,
    )
    .join("");

  return `
    <div class="rating-stars-row">
      ${stars}
      ${selectedScore ? `<span class="ms-2 text-muted small">Your choice: ${selectedScore}/5</span>` : ""}
    </div>
  `;
}

window.submitProviderRating = function (providerId, score) {
  if (!requireLogin("Please log in or sign up first to rate a provider."))
    return;

  const currentUser =
    window.currentUser ||
    JSON.parse(localStorage.getItem("currentUser") || "null");

  if (!currentUser?.email) {
    showToast("Please log in or sign up first to rate a provider.", "error");
    return;
  }

  apiFetch(`/providers/${providerId}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rating: score,
      userEmail: currentUser.email,
      role: currentUser.role || "Customer",
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) {
        showToast(data.message || "Rating failed", "error");
        return;
      }
      showToast("Rating saved successfully ✅", "success");
      loadServices();
    })
    .catch(() => showToast("Could not save rating ❌", "error"));
};

function renderServiceCards(providers, filter = "") {
  const currentUser = getCurrentUserState();
  const container = getActiveCatalogContainer("services");
  if (!container) return [];

  container.innerHTML = "";

  const role = getUserRole();
  if (!Array.isArray(providers) || providers.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-4 text-muted">
        No services available right now.
      </div>
    `;
    return [];
  }

  const filtered = providers.filter((p) => {
    const normalizedRole = String(p?.role || "").toLowerCase();
    const matchesRole = normalizedRole === "technician";
    const searchTerm = String(filter || "").toLowerCase();

    const matchesSearch =
      !searchTerm ||
      matchesFilterTerm(p?.name, searchTerm) ||
      matchesFilterTerm(p?.specialty, searchTerm) ||
      matchesFilterTerm(p?.location, searchTerm) ||
      matchesFilterTerm(p?.role, searchTerm);

    const isOwnProvider =
      normalizeEmail(p.owner || p.userEmail) ===
      normalizeEmail(currentUser?.email);

    if (role === "Technician") {
      return matchesRole && matchesSearch && isOwnProvider;
    }

    return matchesRole && matchesSearch;
  });

  filtered.forEach((p) => {
    const isOwnProvider =
      normalizeEmail(p.owner || p.userEmail) ===
      normalizeEmail(currentUser?.email);
    const userRole = currentUser?.role || "Guest";

    container.innerHTML += `
      <div class="col-md-4 mb-4">
        <div class="card shadow-sm">
          <img loading="lazy" src="${getUploadImageUrl(p.image)}" alt="${p.name || "Service image"}" style="height:200px; object-fit:cover;">
          <div class="card-body">
            <h5>${p.name}</h5>
            <p>${p.specialty}</p>
            <p>${p.location}</p>
            <div class="mb-2">
              <span class="badge bg-warning text-dark">${p.badge || getProviderBadge(p)}</span>
              <span class="ms-2 text-muted">⭐ ${Number(p.ratingAvg || 0).toFixed(1)} (${p.ratingCount || 0} ratings)</span>
            </div>
            ${
              canRateProviders(currentUser)
                ? `<div class="mb-2 text-warning">${renderRatingStars(p, currentUser)}</div>
                   <small class="text-muted">Click a star to rate — your latest choice is counted once</small>`
                : `<small class="text-muted">Only customers can rate technicians and sellers.</small>`
            }
            ${
              currentUser?.role === "Customer" && !isOwnProvider
                ? `<button class="btn btn-outline-dark w-100 mt-2 chat-btn" data-owner="${p.owner || p.userEmail || ""}" data-name="${p.name}">💬 Chat / Book</button>`
                : ""
            }
            <button class="btn btn-primary w-100 mt-2" onclick='openServiceDetail(${JSON.stringify(p)})'>View Details</button>
            ${
              isOwnProvider &&
              (currentUser?.role === "Seller" ||
                currentUser?.role === "Technician")
                ? `<button class="btn btn-warning w-100 mt-2" onclick="editProvider('${p._id || p.id}')">Edit</button>
                   <button class="btn btn-danger w-100 mt-2" onclick="deleteProvider('${p._id || p.id}')">Delete</button>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  });

  return filtered;
}

window.loadServices = function (filter = "") {
  const cachedProviders = getPersistedCache("fixhub_providers_cache");

  if (Array.isArray(cachedProviders)) {
    renderServiceCards(cachedProviders, filter);
  }

  if (
    Array.isArray(window.loadedServices) &&
    window.loadedServices.length > 0
  ) {
    return Promise.resolve(renderServiceCards(window.loadedServices, filter));
  }

  return apiFetch("/providers")
    .then((res) => res.json())
    .then((data) => {
      const providers = normalizeArrayData(data);
      setPersistedCache("fixhub_providers_cache", providers);
      window.loadedServices = providers;
      return renderServiceCards(providers, filter);
    })
    .catch((err) => {
      console.error("SERVICE ERROR:", err);
      const container = getActiveCatalogContainer("services");
      if (container) {
        container.innerHTML = "";
        FALLBACK_PROVIDERS.forEach((p) => {
          container.innerHTML += `
            <div class="col-md-4 mb-4">
              <div class="card shadow-sm">
                <img loading="lazy" src="${getUploadImageUrl(p.image)}" alt="${p.name || "Service image"}" style="height:200px; object-fit:cover;">
                <div class="card-body">
                  <h5>${p.name}</h5>
                  <p>${p.specialty}</p>
                  <p>${p.location}</p>
                  <div class="mb-2">
                    <span class="badge bg-warning text-dark">${p.badge || getProviderBadge(p)}</span>
                    <span class="ms-2 text-muted">⭐ ${Number(p.ratingAvg || 0).toFixed(1)} (${p.ratingCount || 0} ratings)</span>
                  </div>
                  <button class="btn btn-outline-dark w-100 mt-2 chat-btn" data-name="${p.name}">💬 Chat / Hire</button>
                  <button class="btn btn-primary w-100 mt-2" onclick="requireLogin('Please log in or sign up first to view details.')">View Details</button>
                </div>
              </div>
            </div>`;
        });
      }
      return [];
    });
};

window.registerProvider = function () {
  console.log("REGISTER CLICKED"); // 🔥 TEST

  const currentUser =
    window.currentUser ||
    JSON.parse(localStorage.getItem("currentUser") || "null");

  const name = document.getElementById("provider-name").value;

  let role = document.getElementById("provider-role").value;
  if (
    !role &&
    (currentUser?.role === "Seller" || currentUser?.role === "Technician")
  ) {
    role = currentUser.role;
  }
  const specialty = document.getElementById("provider-specialty").value;
  const location = document.getElementById("provider-location").value;
  const price = document.getElementById("provider-price").value;
  const description = document.getElementById("provider-description").value;

  // Check both file input and camera input
  const fileInput = document.getElementById("provider-image");
  const cameraInput = document.getElementById("provider-camera");
  const imageFile = cameraInput?.files?.[0] || fileInput?.files?.[0];

  if (!imageFile) {
    showToast("Please upload an image or take a photo 📸", "error");
    return;
  }

  if (!["Seller", "Technician"].includes(role)) {
    showToast("Only Seller and Technician can post here ⚠️");
    return;
  }

  if (
    !name.trim() ||
    !role ||
    !specialty.trim() ||
    !location.trim() ||
    !description.trim()
  ) {
    showToast("Please fill all required fields ⚠️");
    return;
  }

  if (role === "Seller" && !price.trim()) {
    showToast("Seller must enter price ⚠️");
    return;
  }
  const formData = new FormData();

  formData.append("name", name);
  formData.append("role", role);
  formData.append("specialty", specialty);
  formData.append("location", location);
  formData.append("price", price);
  formData.append("description", description);
  formData.append("owner", currentUser?.email || "");

  formData.append("image", imageFile);

  apiFetch("/providers", {
    method: "POST",
    body: formData,
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      const isSuccessful = res.ok && data.success !== false;

      if (!isSuccessful) {
        showToast(data.message || "Registration failed ❌");
        return;
      }

      if (role === "Seller") {
        await createProductFromSeller();
      }

      showToast("Registered successfully ✅");

      const accountView = document.getElementById("account-view");
      if (accountView && accountView.style.display === "block") {
        accountView.style.display = "none";
        document.getElementById("home-view").style.display = "block";
        document.getElementById("catalog-view").style.display = "none";
        document.querySelector(".hero").style.display = "block";
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      loadServices();
      loadProducts();

      document.getElementById("provider-name").value = "";
      document.getElementById("provider-role").value = "";
      document.getElementById("provider-specialty").value = "";
      document.getElementById("provider-location").value = "";
      document.getElementById("provider-price").value = "";
      document.getElementById("provider-description").value = "";
      document.getElementById("provider-image").value = "";
   })
    .catch((err) => {
      console.error("🔥 CRITICAL POST ERROR DETAILS:", err); // <-- Add this line
      showToast("Server error ❌");
    });
};
window.onload = function () {
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get("success") === "true") {
    document
      .querySelectorAll("section")
      .forEach((s) => (s.style.display = "none"));

    document.getElementById("order-confirmation").style.display = "block";
  }
};

let currentDetailProduct = null;
let currentDetailType = "product";

function getProductDetailText(product) {
  return (
    (product?.details && String(product.details).trim()) ||
    (product?.description && String(product.description).trim()) ||
    (product?.specialty && String(product.specialty).trim()) ||
    (product?.longDescription && String(product.longDescription).trim()) ||
    "No detail available yet."
  );
}

function renderDetailComments(comments) {
  const container = document.getElementById("detail-comments");
  if (!container) return;

  const items = Array.isArray(comments) ? comments : [];

  if (!items.length) {
    container.innerHTML =
      '<p class="text-muted mb-0">No comments yet. Be the first to share your experience.</p>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const name = item.userName || item.userEmail || "Customer";
      const date = item.createdAt
        ? new Date(item.createdAt).toLocaleString()
        : "Just now";
      return `<article class="border rounded p-2 mb-2"><strong>${name}</strong><div class="text-muted small">${date}</div><p class="mb-0">${String(item.text || "").replace(/</g, "&lt;")}</p></article>`;
    })
    .join("");
}

window.submitDetailComment = async function () {
  if (!requireLogin("Please log in or sign up first to post a comment."))
    return;

  if (!currentDetailProduct) return;

  const user = getCurrentUserState();
  if (String(user?.role || "").toLowerCase() !== "customer") {
    showToast("Only customers can post comments.", "error");
    return;
  }

  const text = document.getElementById("detail-comment-input")?.value?.trim();
  if (!text) {
    showToast("Please write a comment before posting.", "error");
    return;
  }

  const endpoint =
    currentDetailType === "service"
      ? `/providers/${currentDetailProduct._id || currentDetailProduct.id}/comments`
      : `/products/${currentDetailProduct._id || currentDetailProduct.id}/comments`;

  try {
    console.log("COMMENT POST", { endpoint, user, text });
    const response = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userEmail: user?.email,
        userName: user?.name || user?.email,
        role: user?.role,
        text,
      }),
    });

    const rawBody = await response.text();
    let data = {};
    try {
      data = JSON.parse(rawBody || "{}");
    } catch (parseErr) {
      console.warn("COMMENT RESPONSE PARSE FAILED", rawBody, parseErr);
    }

    if (!response.ok || !data.success) {
      const message =
        data.message ||
        data.error ||
        rawBody ||
        `Comment failed (${response.status})`;
      console.error("COMMENT FAILED", {
        endpoint,
        responseStatus: response.status,
        message,
        data,
      });
      showToast(message, "error");
      return;
    }

    renderDetailComments(data.comments || []);
    document.getElementById("detail-comment-input").value = "";
    showToast("Comment posted successfully ✅", "success");
  } catch (err) {
    console.error("COMMENT ERROR:", err);
    showToast("Could not save your comment.", "error");
  }
};

window.openProductDetail = function (product) {
  if (!requireLogin("Please log in or sign up first to view details.")) return;

  currentDetailProduct = product;
  currentDetailType = "product";

  const detailSection = document.getElementById("product-detail");
  const accountView = document.getElementById("account-view");
  const orderConfirmation = document.getElementById("order-confirmation");
  const homeView = document.getElementById("home-view");
  const catalogView = document.getElementById("catalog-view");

  if (homeView) homeView.style.display = "none";
  if (catalogView) catalogView.style.display = "none";
  if (accountView) accountView.style.display = "none";
  if (orderConfirmation) orderConfirmation.style.display = "none";

  if (detailSection) detailSection.style.display = "block";
  // Hide global landing sections to focus on the detail view
  const hero = document.querySelector(".hero");
  if (hero) hero.style.display = "none";
  const delivery = document.getElementById("delivery-section");
  if (delivery) delivery.style.display = "none";
  const trust = document.querySelector(".trust-signals");
  if (trust) trust.style.display = "none";

  const detailImage = document.getElementById("detail-image");
  const detailName = document.getElementById("detail-name");
  const detailPrice = document.getElementById("detail-price");
  const detailOwner = document.getElementById("detail-owner");
  const detailDescription = document.getElementById("detail-description");
  const cartButton = document.getElementById("detail-cart-btn");
  const bnplButton = document.getElementById("bnpl-btn");

  if (detailImage) {
    detailImage.src = getUploadImageUrl(product?.image) || "";
    detailImage.alt = product?.name
      ? `${product.name} preview image`
      : "Selected product image";
    detailImage.loading = "lazy";
  }

  if (detailName) detailName.innerText = product?.name || "Product";
  if (detailPrice) detailPrice.innerText = `ETB ${product?.price ?? 0}`;
  if (detailOwner)
    detailOwner.innerText = `Seller: ${product?.owner || "Unknown seller"}`;
  if (detailDescription) {
    detailDescription.innerText = getProductDetailText(product);
  }
  if (cartButton) cartButton.style.display = "block";
  if (bnplButton) bnplButton.style.display = "block";

  const commentInput = document.getElementById("detail-comment-input");
  const commentButton = document.getElementById("detail-comment-btn");
  const isCustomer =
    String(getCurrentUserState()?.role || "").toLowerCase() === "customer";

  if (commentInput) {
    commentInput.disabled = !isCustomer;
    commentInput.placeholder = isCustomer
      ? "Write a comment about this product or service..."
      : "Only customers can post comments.";
  }

  if (commentButton) {
    commentButton.style.display = isCustomer ? "inline-block" : "none";
  }

  renderDetailComments(product?.comments || []);

  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.openServiceDetail = function (provider) {
  if (!requireLogin("Please log in or sign up first to view details.")) return;

  currentDetailProduct = provider;
  currentDetailType = "service";

  const detailSection = document.getElementById("product-detail");
  const accountView = document.getElementById("account-view");
  const homeView = document.getElementById("home-view");
  const catalogView = document.getElementById("catalog-view");

  if (homeView) homeView.style.display = "none";
  if (catalogView) catalogView.style.display = "none";
  if (accountView) accountView.style.display = "none";
  if (detailSection) detailSection.style.display = "block";

  const hero = document.querySelector(".hero");
  if (hero) hero.style.display = "none";
  const delivery = document.getElementById("delivery-section");
  if (delivery) delivery.style.display = "none";
  const trust = document.querySelector(".trust-signals");
  if (trust) trust.style.display = "none";

  const detailImage = document.getElementById("detail-image");
  const detailName = document.getElementById("detail-name");
  const detailPrice = document.getElementById("detail-price");
  const detailOwner = document.getElementById("detail-owner");
  const detailDescription = document.getElementById("detail-description");
  const cartButton = document.getElementById("detail-cart-btn");
  const bnplButton = document.getElementById("bnpl-btn");

  if (detailImage) {
    detailImage.src = getUploadImageUrl(provider?.image) || "";
    detailImage.alt = provider?.name
      ? `${provider.name} preview image`
      : "Selected service image";
    detailImage.loading = "lazy";
  }
  if (detailName) detailName.innerText = provider?.name || "Service";
  if (detailPrice)
    detailPrice.innerText = provider?.price
      ? `ETB ${provider.price}`
      : "Price available on request";
  if (detailOwner)
    detailOwner.innerText = `Technician / Seller: ${provider?.owner || "Unknown provider"}`;
  if (detailDescription)
    detailDescription.innerText = getProductDetailText(provider);
  if (cartButton) cartButton.style.display = "none";
  if (bnplButton) bnplButton.style.display = "none";

  const commentInput = document.getElementById("detail-comment-input");
  const commentButton = document.getElementById("detail-comment-btn");
  const isCustomer =
    String(getCurrentUserState()?.role || "").toLowerCase() === "customer";

  if (commentInput) {
    commentInput.disabled = !isCustomer;
    commentInput.placeholder = isCustomer
      ? "Write a comment about this product or service..."
      : "Only customers can post comments.";
  }

  if (commentButton) {
    commentButton.style.display = isCustomer ? "inline-block" : "none";
  }

  renderDetailComments(provider?.comments || []);

  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.closeProductDetail = function () {
  const detailSection = document.getElementById("product-detail");
  if (detailSection) detailSection.style.display = "none";

  if (typeof window.goHome === "function") {
    window.goHome();
  } else {
    const homeView = document.getElementById("home-view");
    const catalogView = document.getElementById("catalog-view");
    if (homeView) homeView.style.display = "block";
    if (catalogView) catalogView.style.display = "block";
    const hero = document.querySelector(".hero");
    if (hero) hero.style.display = "block";
    const delivery = document.getElementById("delivery-section");
    if (delivery) delivery.style.display = "block";
    const trust = document.querySelector(".trust-signals");
    if (trust) trust.style.display = "block";
  }
};
window.addDetailToCart = function () {
  if (!currentDetailProduct) return;

  addToCart(currentDetailProduct);
};
function searchProviders() {
  const value = document.getElementById("search-input").value.toLowerCase();

  apiFetch("/providers", {
    headers: {
      Authorization: localStorage.getItem("token"),
    },
  })
    .then((res) => res.json())
    .then((data) => {
      const filtered = data.filter((p) => {
        const name = String(p?.name || "").toLowerCase();
        const specialty = String(p?.specialty || "").toLowerCase();
        const role = String(p?.role || "").toLowerCase();

        return (
          name.includes(value) ||
          specialty.includes(value) ||
          role.includes(value)
        );
      });

      filtered.forEach((provider) => {
        providerList.innerHTML += renderProviderCard(provider);
      });
    })
    .catch((err) => console.error(err));
}
function deleteProvider(id) {
  if (!id) return;
  if (!confirm("Delete this service?")) return;

  apiFetch(`/providers/${id}`, {
    method: "DELETE",
  })
    .then((res) => res.json())
    .then(() => {
      showToast("Service deleted ✅", "success");
      loadServices();
    })
    .catch(() => showToast("Delete failed ❌", "error"));
}

window.editProvider = function (id) {
  editingProviderId = id;

  apiFetch(`/providers/${id}`)
    .then((res) => res.json())
    .then((provider) => {
      document.getElementById("edit-provider-name").value = provider.name || "";
      document.getElementById("edit-provider-specialty").value =
        provider.specialty || "";
      document.getElementById("edit-provider-location").value =
        provider.location || "";
      document.getElementById("edit-provider-price").value =
        provider.price || "";
      document.getElementById("edit-provider-description").value =
        provider.description || "";

      const modal = new bootstrap.Modal(
        document.getElementById("editProviderModal"),
      );
      modal.show();
    })
    .catch(() => showToast("Could not load service ❌", "error"));
};

window.saveProviderEdit = function () {
  if (!editingProviderId) return;

  const updatedProvider = {
    name: document.getElementById("edit-provider-name").value.trim(),
    specialty: document.getElementById("edit-provider-specialty").value.trim(),
    location: document.getElementById("edit-provider-location").value.trim(),
    price: Number(document.getElementById("edit-provider-price").value) || 0,
    description: document
      .getElementById("edit-provider-description")
      .value.trim(),
  };

  apiFetch(`/providers/${editingProviderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedProvider),
  })
    .then((res) => res.json())
    .then(() => {
      showToast("Service updated ✅", "success");
      bootstrap.Modal.getInstance(
        document.getElementById("editProviderModal"),
      )?.hide();
      loadServices();
    })
    .catch(() => showToast("Update failed ❌", "error"));
};

function togglePriceField() {
  const selectedRole = document.getElementById("provider-role").value;
  const role = selectedRole || getUserRole();
  const priceContainer = document.getElementById("price-container");

  if (!priceContainer) return;

  priceContainer.style.display = role === "Seller" ? "block" : "none";
}
function updateSpecialtyLabel() {
  const role = document.getElementById("provider-role").value;
  const label = document.getElementById("specialty-label");
  const input = document.getElementById("provider-specialty");

  if (role === "Seller") {
    label.innerText = "Product Name";
    input.placeholder = "Enter product name";
  } else {
    label.innerText = "Specialty";
    input.placeholder = "Enter your specialty";
  }
}

function updateFileLabel() {
  const role = document.getElementById("provider-role").value;
  const label = document.getElementById("file-label");

  label.innerText =
    role === "Seller" ? "Upload Product Image" : "Upload Profile Picture";
}

window.sendMessage = async function () {
  console.log("SEND MESSAGE DEBUG:", {
    currentUser: currentUser.email,
    currentRoom: currentRoom,
    provider: currentProvider,
  });

  const text = document.getElementById("chat-input").value;

  if (!text.trim()) {
    showToast("Type a message first ❌", "error");
    return;
  }

  if (!currentUser || !currentRoom) {
    showToast("Chat not ready ❌", "error");
    return;
  }

  const sender = currentUser.email;
  const receiver = currentProvider;

  if (sender === receiver) {
    console.error("❌ Self chat blocked");
    return;
  }

  const newMsg = {
    room: currentRoom,
    sender,
    receiver,
    text,
    time: Date.now(),
    seen: false,
  };

  await apiFetch("/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: localStorage.getItem("token"),
    },
    body: JSON.stringify(newMsg),
  });

  console.log("SENDING NOTIFICATION:", {
    sender,
    receiver,
    text,
  });
  console.log("🔥 ABOUT TO SEND NOTIFICATION:", {
    sender,
    receiver,
    text,
  });

  document.getElementById("chat-input").value = "";
  updateChatPreview();

  loadMessages();
};
async function loadMessages() {
  const chatBox = document.getElementById("chat-box");
  if (!chatBox) return;

  chatBox.innerHTML = "";

  try {
    const res = await apiFetch(`/messages/${currentRoom}`);

    if (!res.ok) {
      console.error("Failed to load messages");
      return;
    }

    const messages = await res.json();

    if (!Array.isArray(messages)) return;

    messages
      .sort((a, b) => a.time - b.time)
      .forEach((m) => {
        chatBox.innerHTML += `
          <div class="mb-2">
            <strong>${m.sender}:</strong>
            ${m.text || m.message || "⚠️ empty message"}
          </div>
        `;
      });

    setTimeout(() => {
      const chatMessages = document.querySelector(".modal-body");
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }, 10);
  } catch (err) {
    console.error("LOAD MESSAGE ERROR:", err);
  }
}
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.className = "toast-message";
  toast.style.display = "block";
  toast.classList.add("show");

  if (type === "success") {
    toast.classList.add("toast-success");
  } else if (type === "error") {
    toast.classList.add("toast-error");
  } else {
    toast.classList.add("toast-info");
  }

  toast.innerText = message;

  if (toast._hideTimer) {
    clearTimeout(toast._hideTimer);
  }

  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.style.display = "none";
    delete toast._hideTimer;
  }, 2500);
}

function updateChatPreview() {
  const textarea = document.getElementById("chat-input");
  const preview = document.getElementById("chat-preview");
  if (!textarea || !preview) return;

  const value = textarea.value.trim();
  preview.style.display = value ? "block" : "none";
  preview.textContent = value ? `You: ${value}` : "";

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
}
function bookService() {
  if (!requireLogin("Please log in or sign up first to book this service."))
    return;

  if (!currentUser) {
    showToast("Please log in or sign up first to book this service.", "error");
    return;
  }

  const booking = {
    room: currentRoom,
    customer: currentUser.name,
    time: new Date().toISOString(),
    status: "pending",
  };

  let bookings = JSON.parse(localStorage.getItem("bookings")) || [];
  bookings.push(booking);
  localStorage.setItem("bookings", JSON.stringify(bookings));

  showToast("Booking sent to " + currentProvider + " ✅", "success");
}
function createProductFromSeller() {
  const name = document.getElementById("provider-name").value.trim();
  const price = document.getElementById("provider-price").value.trim();
  const description = document
    .getElementById("provider-description")
    .value.trim();
  const imageFile = document.getElementById("provider-image").files[0];
  const seller = getCurrentUserState();

  if (!imageFile) {
    showToast("Upload product image ⚠️", "error");
    return Promise.reject(new Error("Missing image"));
  }

  if (!seller?.email) {
    showToast("Please log in again before posting.", "error");
    return Promise.reject(new Error("Missing seller"));
  }

  const formData = new FormData();
  formData.append("owner", seller.email);
  formData.append("name", name || "Seller Product");
  formData.append("price", price || "0");
  formData.append("description", description || "");
  formData.append("details", description || "");
  formData.append("image", imageFile);

  return apiFetch("/products", {
    method: "POST",
    headers: {
      Authorization: localStorage.getItem("token") || "",
    },
    body: formData,
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(
          data.error || data.message || "Product creation failed",
        );
      }
      showToast("Product posted successfully ✅", "success");
      loadProducts();
      return data;
    })
    .catch((err) => {
      console.error("CREATE PRODUCT ERROR:", err);
      showToast(err.message || "Product creation failed ❌", "error");
      throw err;
    });
}
window.handleSearch = function () {
  const value = document.getElementById("search-input").value.toLowerCase();

  loadProducts(value);
  loadServices(value);
};
window.openChat = function (email) {
  if (!requireLogin("Please log in or sign up first to chat or hire.")) return;

  const token = localStorage.getItem("token");
  const bookBtn = document.getElementById("book-now-btn");

  if (!token) {
    showToast("Please log in or sign up first to chat or hire.", "error");
    return;
  }

  if (!window.currentUser) {
    showToast("User not ready");
    return;
  }

  const sender = window.currentUser.email;
  const receiver = email;

  if (sender === receiver) {
    console.error("❌ Self chat blocked");
    return;
  }

  currentRoom = [sender, receiver].sort().join("_");

  currentProvider = receiver;
  currentChatProviderRole = "";

  apiFetch("/providers")
    .then((res) => res.json())
    .then((providers) => {
      const provider = providers.find(
        (item) =>
          String(item.owner || "").toLowerCase() === receiver.toLowerCase(),
      );
      currentChatProviderRole = String(provider?.role || "");

      if (bookBtn) {
        bookBtn.style.display =
          currentChatProviderRole === "Technician" ? "block" : "none";
      }
    })
    .catch(() => {
      if (bookBtn) bookBtn.style.display = "none";
    });

  console.log("CHAT OPENED:");
  console.log("User:", sender);
  console.log("Receiver:", receiver);
  console.log("Room:", currentRoom);

  loadMessages();

  const modal = new bootstrap.Modal(document.getElementById("chatModal"));

  modal.show();
};

document.addEventListener("DOMContentLoaded", async () => {
  updateUserUI();

  const hasAccountProfile = !!document.getElementById("account-name");
  if (hasAccountProfile) {
    renderAccountProfile();
  }

  const hasCatalogUI =
    !!document.getElementById("products-container") ||
    !!document.getElementById("services-container") ||
    !!document.getElementById("catalog-products-container") ||
    !!document.getElementById("catalog-services-container");

  const userState = getCurrentUserState();
  const canLoadNotifications =
    !!document.getElementById("notif-count") &&
    ["Seller", "Customer", "Technician"].includes(userState?.role || "");

  if (hasCatalogUI) {
    Promise.allSettled([
      loadProducts(),
      loadServices(),
      userState?.role === "Customer" && document.getElementById("cart-count")
        ? loadCart()
        : Promise.resolve(),
      canLoadNotifications ? loadNotifications() : Promise.resolve(),
    ]).catch((err) => {
      console.error("HOME DATA LOAD FAILED", err);
    });
  } else {
    if (
      userState?.role === "Customer" &&
      document.getElementById("cart-count")
    ) {
      loadCart().catch((err) => {
        console.error("CART LOAD FAILED", err);
      });
    }

    if (canLoadNotifications) {
      loadNotifications().catch((err) => {
        console.error("NOTIFICATION LOAD FAILED", err);
      });
    }
  }

  if (canLoadNotifications) {
    setInterval(loadNotifications, 30000);
  }

  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("chat-btn")) {
      const ownerEmail =
        event.target.getAttribute("data-owner") ||
        event.target.getAttribute("data-email");
      const providerName = event.target.getAttribute("data-name");

      if (ownerEmail) {
        openChat(ownerEmail);
        return;
      }

      const providerCard = event.target.closest(".card");
      if (providerCard) {
        const servicesContainer =
          document.getElementById("services-container") ||
          document.getElementById("catalog-services-container");
        if (servicesContainer && window.loadedServices) {
          const allCards = Array.from(
            servicesContainer.querySelectorAll(".card"),
          );
          const cardIndex = allCards.indexOf(providerCard);
          if (cardIndex !== -1) {
            const provider = window.loadedServices[cardIndex];
            if (provider?.owner) {
              openChat(provider.owner);
              return;
            }
          }
        }
      }

      if (window.notifications) {
        const notif = window.notifications.find(
          (n) =>
            n.from === providerName ||
            (n.userEmail && n.userEmail.includes(providerName)),
        );
        if (notif) {
          openChat(notif.from || notif.userEmail);
        }
      }
    }
  });

  const chatInput = document.getElementById("chat-input");
  if (chatInput) {
    chatInput.addEventListener("input", updateChatPreview);
    chatInput.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    updateChatPreview();
  }

  const providerImageInput = document.getElementById("provider-image");
  const providerCameraInput = document.getElementById("provider-camera");

  if (providerImageInput) {
    providerImageInput.addEventListener("change", () => {
      if (providerImageInput.files.length > 0) {
        showToast("📤 Photo selected", "success");
      }
    });
  }

  if (providerCameraInput) {
    providerCameraInput.addEventListener("change", () => {
      if (providerCameraInput.files.length > 0) {
        showToast("📸 Photo captured", "success");
      }
    });
  }
});
const providerRole = document.getElementById("provider-role");
if (providerRole) {
  providerRole.addEventListener("change", () => {
    togglePriceField();
    updateSpecialtyLabel();
    updateFileLabel();
  });
}

function applyRoleUI() {
  const role = getUserRole();

  console.log("ROLE:", role);

  const categorySidebar = document.getElementById("category-sidebar");
  const rightContent = document.getElementById("right-content");

  if (categorySidebar) {
    if (role === "Customer") {
      categorySidebar.style.display = "block";
    } else {
      categorySidebar.style.display = "none";
    }
  }

  const providerSection = document.getElementById("provider-section");

  if (providerSection) {
    if (role === "Seller" || role === "Technician") {
      providerSection.style.display = "block";
    } else {
      providerSection.style.display = "none";
    }
  }

  const productsContainer = document.getElementById("products-container");

  const servicesContainer = document.getElementById("services-container");

  const catalogProductsContainer = document.getElementById(
    "catalog-products-container",
  );

  const catalogServicesContainer = document.getElementById(
    "catalog-services-container",
  );

  if (!productsContainer || !servicesContainer) {
    console.error("Missing containers in HTML");
    return;
  }

  const productsSection = productsContainer.parentElement;
  const servicesSection = servicesContainer.parentElement;
  const adSection = document.getElementById("ad-section");

  if (!productsSection || !servicesSection) return;

  productsContainer.style.display = "block";
  servicesContainer.style.display = "block";

  const cartNav = document.getElementById("cart-nav");
  if (cartNav) {
    cartNav.style.display = role === "Customer" ? "block" : "none";
  }

  document.querySelectorAll("button[onclick^='addToCart']").forEach((btn) => {
    btn.style.display = role === "Customer" ? "block" : "none";
  });

  document.querySelectorAll("button[onclick^='editProduct']").forEach((btn) => {
    btn.style.display = role === "Seller" ? "block" : "none";
  });

  document
    .querySelectorAll("button[onclick^='deleteProduct']")
    .forEach((btn) => {
      btn.style.display = role === "Seller" ? "block" : "none";
    });

  if (role === "Customer") {
    productsSection.style.display = "block";
    servicesSection.style.display = "block";
    if (adSection) adSection.style.display = "block";
  } else if (role === "Seller") {
    productsSection.style.display = "block";
    servicesSection.style.display = "none";
    if (adSection) adSection.style.display = "none";
  } else if (role === "Technician") {
    productsSection.style.display = "none";
    servicesSection.style.display = "block";
    if (adSection) adSection.style.display = "none";
  } else {
    productsSection.style.display = "block";
    servicesSection.style.display = "block";
    if (adSection) adSection.style.display = "block";
  }
}

setInterval(() => {
  if (window.currentUser?.role === "Seller") {
    loadNotifications();
  }
}, 5000);
window.loadNotifications = async function () {
  const user = getCurrentUserState();

  if (!user || !user.email) return [];
  if (!["Seller", "Customer", "Technician"].includes(user.role || "")) {
    return [];
  }

  const notifCacheKey = `fixhub_notifications_${user.email}`;
  const cachedNotifications = getPersistedCache(notifCacheKey, 2 * 60 * 1000);

  if (Array.isArray(cachedNotifications)) {
    window.notifications = cachedNotifications;
    const count = window.notifications.filter((n) => !n.seen).length;
    const notifCount = document.getElementById("notif-count");
    if (notifCount) notifCount.innerText = count;
  }

  try {
    const res = await apiFetch(`/notifications/user/${user.email}`);
    const data = await res.json();
    const notifications = Array.isArray(data) ? data : [];
    window.notifications = notifications;
    setPersistedCache(notifCacheKey, notifications);

    const count = notifications.filter((n) => !n.seen).length;
    const notifCount = document.getElementById("notif-count");
    if (notifCount) notifCount.innerText = count;

    if (!window.lastNotifiedRatingIds) {
      window.lastNotifiedRatingIds = new Set();
    }
    notifications.forEach((n) => {
      if (
        n.type === "rating" &&
        !n.seen &&
        !window.lastNotifiedRatingIds.has(n._id || n.id || n.message)
      ) {
        showToast("Someone rated your product or service ⭐", "success");
        window.lastNotifiedRatingIds.add(n._id || n.id || n.message);
      }
    });

    return notifications;
  } catch (err) {
    console.error("LOAD NOTIFICATIONS ERROR:", err);
    return Array.isArray(window.notifications) ? window.notifications : [];
  }
};
window.openNotifications = function () {
  if (!requireLogin("Please log in or sign up first to view notifications."))
    return;

  const container = document.getElementById("notif-list");

  if (!container) {
    console.error("notif-list missing");
    return;
  }
  container.innerHTML = "";

  if (!window.notifications) return;
  console.log(window.notifications);

  window.notifications
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((n) => {
      let text = "";
      let buttonHTML = "";

      if (n.type === "cart") {
        text = `${n.customerEmail || n.from || "A customer"} added your product (${n.productName || "product"}) to cart`;
        buttonHTML = "";
      } else if (n.type === "message") {
        const chatUser = n.from || n.userEmail || "Unknown";
        text = `${chatUser} sent you a message`;
        buttonHTML = `<button class="btn btn-sm btn-primary" onclick="openChatFromNotification('${chatUser}')">💬 Reply</button>`;
      } else if (n.type === "booking") {
        const customerEmail = n.from || "A customer";
        text = `${customerEmail} wants to book your service${n.message ? ` — ${n.message}` : ""}`;
        buttonHTML = `<button class="btn btn-sm btn-success" onclick="openChatFromNotification('${customerEmail}')">📅 View Booking</button>`;
      } else if (n.type === "rating") {
        const customerEmail = n.from || "A customer";
        text = `${customerEmail} rated your ${n.productName || "service"}${n.message ? ` — ${n.message}` : ""}`;
      } else if (n.type === "comment") {
        const customerEmail = n.from || "A customer";
        text = `${customerEmail} commented on your ${n.productName || "item"}`;
        if (n.commentText) {
          text += `: ${n.commentText}`;
        } else if (n.message) {
          text += ` — ${n.message}`;
        }
      }

      if (text) {
        container.insertAdjacentHTML(
          "beforeend",
          `
            <div class="p-2 border mb-2 rounded">
              <p class="mb-2">${text}</p>
              ${buttonHTML}
            </div>
          `,
        );
      }
    });

  new bootstrap.Modal(document.getElementById("notifModal")).show();
};
function handleRoleChange() {
  togglePriceField();
  updateFileLabel();
  updateSpecialtyLabel();
}

window.openBNPL = function () {
  // currentDetailProduct is set when viewing product/service details
  const modalEl = document.getElementById("bnplModal");
  if (!modalEl) return;

  // show product name if available
  const body = document.getElementById("bnpl-modal-body");
  if (body && window.currentDetailProduct) {
    const existing = body.querySelector(".bnpl-product-name");
    if (!existing) {
      const p = document.createElement("p");
      p.className = "bnpl-product-name mb-2";
      p.innerText = `Product: ${window.currentDetailProduct.name || window.currentDetailProduct.title || ""}`;
      body.insertBefore(p, body.firstChild);
    } else {
      existing.innerText = `Product: ${window.currentDetailProduct.name || ""}`;
    }
  }

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
};

window.submitBNPLSelection = function () {
  const provider = document.getElementById("bnpl-provider")?.value || "";
  const period = document.getElementById("bnpl-period")?.value || "";

  const modalBody = document.getElementById("bnpl-modal-body");
  if (!modalBody) return;

  modalBody.innerHTML = `
    <h5>🚧 Coming Soon</h5>
    <p>FixHub is currently developing partnerships with Ethiopian financial institutions to support Buy Now, Pay Later and installment-based purchasing. This feature is a prototype for future financial services and is not yet available.</p>
    <ul>
      <li><strong>Label:</strong> Coming Soon · Prototype Feature · Future Financial Services · Under Development</li>
      <li><strong>Selected provider:</strong> ${escapeHtml(provider)}</li>
      <li><strong>Selected period:</strong> ${escapeHtml(period)} months</li>
    </ul>
    <p class="text-muted small">No real bank connections or loan requests are created by this prototype.</p>
  `;

  const modalEl = document.getElementById("bnplModal");
  const modal =
    bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);

  const footer = modalEl.querySelector(".modal-footer");
  if (footer) {
    footer.innerHTML =
      '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>';
  }

  modal.show();
};

function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

window.openCart = function () {
  console.log("OPEN CART CLICKED");

  renderCart();

  const modal = document.getElementById("cartModal");

  if (!modal) {
    console.log("❌ cartModal NOT FOUND in HTML");
    return;
  }

  new bootstrap.Modal(modal).show();
};
function isSeller() {
  return window.currentUser?.role === "Seller";
}

function isCustomer() {
  return window.currentUser?.role === "Customer";
}

function isTechnician() {
  return window.currentUser?.role === "Technician";
}
const sellerPanel = document.getElementById("seller-panel");

if (sellerPanel) {
  sellerPanel.style.display = isSeller() ? "block" : "none";
}
if (isCustomer()) {
  document.getElementById("products-section").style.display = "block";
  document.getElementById("cart-section").style.display = "block";
}
if (isTechnician()) {
  document.getElementById("services-section").style.display = "block";
}
window.openChatFromNotification = function (email) {
  const notifModalEl = document.getElementById("notifModal");
  const notifModal = bootstrap.Modal.getInstance(notifModalEl);

  if (notifModal) {
    notifModal.hide();
  }

  setTimeout(() => {
    openChat(email);
  }, 300);
};
window.bookTechnicianNow = async function () {
  const customer = getCurrentUserState();

  if (!customer?.email) {
    showToast("Please log in first to book a technician.", "error");
    return;
  }

  if (!currentProvider) {
    showToast("Select a technician chat first.", "error");
    return;
  }

  try {
    const response = await apiFetch("/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: customer.email,
        userEmail: currentProvider,
        message: `${customer.email}: book you now`,
        type: "booking",
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      showToast(data.error || "Booking request failed.", "error");
      return;
    }

    showToast("Booking request sent to technician ✅", "success");
  } catch (err) {
    console.error("BOOK NOW ERROR:", err);
    showToast("Booking request failed ❌", "error");
  }
};

window.goHome = function () {
  document.querySelector(".hero").style.display = "block";

  const delivery = document.getElementById("delivery-section");
  if (delivery) delivery.style.display = "block";

  const trust = document.querySelector(".trust-signals");
  if (trust) trust.style.display = "block";

  document.getElementById("home-view").style.display = "block";

  document.getElementById("catalog-view").style.display = "none";

  document.getElementById("account-view").style.display = "none";

  loadProducts();
  loadServices();

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};

window.openCatalog = function () {
  const role = getUserRole();

  document.querySelector(".hero").style.display = "none";
  document.getElementById("home-view").style.display = "none";
  document.getElementById("catalog-view").style.display = "block";
  document.getElementById("account-view").style.display = "none";

  const deliverySection = document.getElementById("delivery-section");
  const trustSignals = document.querySelector(".trust-signals");
  if (deliverySection) deliverySection.style.display = "none";
  if (trustSignals) trustSignals.style.display = "none";

  const productsSection = document.getElementById("catalog-products-section");
  const servicesSection = document.getElementById("catalog-services-section");

  if (productsSection) {
    productsSection.style.display = role === "Technician" ? "none" : "block";
  }
  if (servicesSection) {
    servicesSection.style.display = role === "Seller" ? "none" : "block";
  }

  loadProducts();
  loadServices();

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};

function renderAccountProfile() {
  const user = getCurrentUserState();
  if (!user) return;

  const accountName = document.getElementById("account-name");
  const accountEmail = document.getElementById("account-email");
  const accountRole = document.getElementById("account-role");
  const accountPhone = document.getElementById("account-phone");
  const accountBirth = document.getElementById("account-birth");
  const accountBio = document.getElementById("account-bio");

  if (accountName) accountName.innerText = user.name || "Unknown";
  if (accountEmail) accountEmail.innerText = user.email || "—";
  if (accountRole) accountRole.innerText = user.role || "Customer";
  if (accountPhone) accountPhone.innerText = user.phone || "—";
  if (accountBirth) accountBirth.innerText = user.birthDate || "—";
  if (accountBio) accountBio.innerText = user.bio || "No bio yet.";

  const profileImg = document.getElementById("account-photo");
  if (profileImg) {
    profileImg.src = getUploadImageUrl(
      user.profileImage,
      "https://via.placeholder.com/120?text=Profile",
    );
    profileImg.alt = user.name ? `${user.name} profile photo` : "Profile photo";
    profileImg.loading = "lazy";
  }
}

window.logoutUser = function () {
  localStorage.removeItem("token");
  localStorage.removeItem("currentUser");
  window.currentUser = null;
  sessionStorage.clear();
  showToast("You have been logged out", "success");
  setTimeout(() => {
    window.location.href = "login.html";
  }, 600);
};

window.openTrustInfo = function (type) {
  const content = {
    reviews: {
      title: "Trusted Reviews",
      body: "Read verified customer feedback, compare technician ratings, and choose providers with confidence. Each review helps you spot reliable service quality before you book.",
    },
    payments: {
      title: "Secure Payments",
      body: "FixHub uses protected checkout flows and secure account handling so your transactions stay safe. You can review payment details before confirming any order.",
    },
    refund: {
      title: "Clear Refund Policy",
      body: "If a service is canceled or does not match the listing, contact support within the review window for a quick refund or replacement review.",
    },
  };

  const item = content[type] || content.reviews;
  document.getElementById("trustModalTitle").innerText = item.title;
  document.getElementById("trustModalBody").innerText = item.body;

  const modal = new bootstrap.Modal(document.getElementById("trustModal"));
  modal.show();
};

window.openAccount = function () {
  updateUserUI();
  renderAccountProfile();

  const currentRole = getUserRole();

  const providerSection = document.getElementById("provider-section");
  if (providerSection) {
    if (currentRole === "Customer") {
      providerSection.style.display = "none";
    } else if (currentRole === "Seller" || currentRole === "Technician") {
      providerSection.style.display = "block";

      const providerRoleSelect = document.getElementById("provider-role");
      if (providerRoleSelect) {
        providerRoleSelect.value = currentRole;
      }
      togglePriceField();
      updateSpecialtyLabel();
      updateFileLabel();
    } else {
      providerSection.style.display = "none";
    }
  }

  applyRoleUI();

  document.querySelector(".hero").style.display = "none";
  document.getElementById("home-view").style.display = "none";
  document.getElementById("catalog-view").style.display = "none";
  document.getElementById("account-view").style.display = "block";

  const deliverySection = document.getElementById("delivery-section");
  const trustSignals = document.querySelector(".trust-signals");
  if (deliverySection) deliverySection.style.display = "none";
  if (trustSignals) trustSignals.style.display = "none";

  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.openAbout = async function (evt) {
  try {
    if (evt && evt.preventDefault) evt.preventDefault();

    const resp = await fetch("about.html");
    const html = await resp.text();

    const match = html.match(/<main[\s\S]*<\/main>/i);
    const content = match ? match[0] : html;

    let modal = document.getElementById("aboutModal");
    if (!modal) {
      const template = document.createElement("div");
      template.innerHTML = `
        <div class="modal fade" id="aboutModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">About FixHub</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body" id="aboutModalBody"></div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(template);
      modal = document.getElementById("aboutModal");
    }

    const body = modal.querySelector("#aboutModalBody");
    if (body) {
      body.innerHTML = content;
    }

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  } catch (e) {
    console.error("Failed to open About modal:", e);

    window.location.href = "about.html";
  }
};
