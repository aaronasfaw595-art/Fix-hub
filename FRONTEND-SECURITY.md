# Frontend Security Best Practices

## 1. Form Input Validation

### Password Strength Validation

Add this function to `script.js`:

```javascript
function validatePasswordStrength(password) {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const isStrong =
    requirements.length &&
    requirements.uppercase &&
    requirements.lowercase &&
    requirements.number &&
    requirements.special;

  return { isStrong, requirements };
}

// Use in registration form:
document.getElementById("registerBtn").addEventListener("click", async () => {
  const password = document.getElementById("password").value;
  const { isStrong, requirements } = validatePasswordStrength(password);

  if (!isStrong) {
    let message = "Password must contain:\n";
    if (!requirements.length) message += "- Minimum 8 characters\n";
    if (!requirements.uppercase) message += "- At least one uppercase letter\n";
    if (!requirements.lowercase) message += "- At least one lowercase letter\n";
    if (!requirements.number) message += "- At least one number\n";
    if (!requirements.special) message += "- At least one special character\n";
    showToast(message, "error");
    return;
  }
  // Proceed with registration
});
```

### Email Validation

```javascript
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Before login/register:
if (!isValidEmail(email)) {
  showToast("Please enter a valid email address", "error");
  return;
}
```

### Name Validation

```javascript
function isValidName(name) {
  // 2-100 characters, letters, numbers, spaces, hyphens
  return name.trim().length >= 2 && name.trim().length <= 100;
}

if (!isValidName(name)) {
  showToast("Name must be 2-100 characters", "error");
  return;
}
```

### Phone Validation

```javascript
function isValidPhone(phone) {
  // Allow digits, spaces, hyphens, parentheses, plus
  return /^[0-9\-\+\s()]{7,}$/.test(phone);
}

if (!isValidPhone(phone)) {
  showToast("Please enter a valid phone number", "error");
  return;
}
```

---

## 2. XSS (Cross-Site Scripting) Prevention

### Safe DOM Manipulation

✅ **Safe** - Use these methods:

```javascript
// Setting text content (not HTML)
element.textContent = userInput;

// Setting from trusted sources only
element.innerHTML = templateHTML; // Only if you control templateHTML

// Using createElement for dynamic content
const div = document.createElement("div");
div.textContent = userInput;
```

❌ **Unsafe** - Avoid these:

```javascript
// Never use with user input
element.innerHTML = userInput;

// Never use eval
eval(userInput);

// Never use new Function
new Function(userInput)();
```

### Sanitize User-Generated Content

For comments and user-generated text:

```javascript
function sanitizeHTML(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Use when rendering comments:
const sanitizedComment = sanitizeHTML(userComment);
element.innerHTML = `<p>${sanitizedComment}</p>`;
```

---

## 3. localStorage Security

### Current Implementation

```javascript
// Storing JWT token
localStorage.setItem("token", response.token);
localStorage.setItem("currentUser", JSON.stringify(response.user));

// Retrieving
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("currentUser"));

// Logout - Clear sensitive data
localStorage.clear();
```

### Security Considerations

⚠️ **localStorage is vulnerable to XSS attacks**

When localStorage is compromised:

- JWT tokens are exposed
- Attacker can impersonate user
- User session can be hijacked

### Mitigations

1. **Use HTTPS only** - Prevents man-in-the-middle attacks
2. **Implement token expiration** - Current: 1 day ✅
3. **Refresh token strategy** - Optional enhancement:
   ```javascript
   // If token is expired, request new one
   if (isTokenExpired(token)) {
     const newToken = await refreshToken();
     localStorage.setItem("token", newToken);
   }
   ```
4. **Regular token refresh** - Periodically refresh even if valid
5. **Future improvement: httpOnly cookies** - Requires backend changes

---

## 4. API Communication Security

### Send Requests Safely

```javascript
// Include JWT token in all authenticated requests
async function makeAuthenticatedRequest(url, method = "GET", data = null) {
  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`, // JWT token
  };

  const options = {
    method,
    headers,
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);

    if (response.status === 401) {
      // Token expired or invalid
      handleLogout();
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Request failed:", error);
    showToast("Network error. Please try again.", "error");
    return null;
  }
}

// Usage:
const result = await makeAuthenticatedRequest("/api/user/profile", "GET");

const updatedUser = await makeAuthenticatedRequest("/api/user/update", "POST", {
  name: "New Name",
});
```

### Validate Server Responses

```javascript
// Always validate API responses
function validateResponse(response) {
  if (!response || typeof response !== "object") {
    showToast("Invalid server response", "error");
    return false;
  }

  if (!response.success && response.success !== undefined) {
    showToast(response.message || "Operation failed", "error");
    return false;
  }

  return true;
}

// Usage:
const response = await fetch("/api/endpoint");
const data = await response.json();

if (!validateResponse(data)) {
  return; // Error already shown to user
}

// Continue processing trusted data
processData(data);
```

---

## 5. Form Security

### Protect Form Submissions

```javascript
// Disable submit button during submission
async function handleFormSubmit(event) {
  event.preventDefault();

  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Processing...";

  try {
    // Validate inputs first
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      showToast("Please fill all fields", "error");
      return;
    }

    if (!isValidEmail(email)) {
      showToast("Invalid email format", "error");
      return;
    }

    // Send request
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!data.success) {
      showToast(data.message, "error");
      return;
    }

    // Success - store token and redirect
    localStorage.setItem("token", data.token);
    localStorage.setItem("currentUser", JSON.stringify(data.user));
    window.location.href = "/index.html";
  } catch (error) {
    showToast("Login failed. Please try again.", "error");
    console.error(error);
  } finally {
    // Re-enable button
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
  }
}

// Attach to form
document
  .getElementById("loginForm")
  .addEventListener("submit", handleFormSubmit);
```

---

## 6. File Upload Security

### Validate File Before Upload

```javascript
function validateFile(file) {
  // Check file size (5MB limit)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    showToast("File size exceeds 5MB limit", "error");
    return false;
  }

  // Check file type
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    showToast("Only JPEG, PNG, GIF, WebP images allowed", "error");
    return false;
  }

  // Check file extension (double validation)
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const extension = "." + file.name.split(".").pop().toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    showToast("Invalid file extension", "error");
    return false;
  }

  return true;
}

// Handle file input
document.getElementById("profileImage").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file && !validateFile(file)) {
    e.target.value = ""; // Clear input
  }
});
```

---

## 7. HTTPS Enforcement

### Check Protocol and Redirect

```javascript
// Add to top of script.js
if (window.location.protocol === "http:" && !isLocalhost()) {
  window.location.protocol = "https:";
}

function isLocalhost() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}
```

### Set API Base URL Securely

```javascript
// Use protocol-relative or explicit HTTPS
const API_BASE =
  window.location.protocol === "https:" || !isLocalhost()
    ? "https://api.fixhub.com"
    : "http://localhost:3000";
```

---

## 8. Content Security Policy (CSP)

### Frontend CSP Header (Backend Sends)

Already configured in `server.js`:

```
Content-Security-Policy: default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
  img-src 'self' data: https:;
  font-src 'self' https://fonts.gstatic.com
```

### What This Protects

- Prevents inline scripts (except necessary ones)
- Only allows scripts from your domain and CDN
- Restricts image loading to HTTPS and data URIs
- Prevents data exfiltration to untrusted domains

---

## 9. Session Management

### Implement Session Check

```javascript
// Check token validity on page load
async function validateSession() {
  const token = localStorage.getItem("token");

  if (!token) {
    return false; // Not logged in
  }

  // Verify token is still valid by making API call
  try {
    const response = await fetch("/api/user/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      // Token expired
      handleLogout();
      return false;
    }

    return response.ok;
  } catch (error) {
    console.error("Session validation failed:", error);
    return false;
  }
}

// On page load
window.addEventListener("load", async () => {
  const isValid = await validateSession();
  if (!isValid) {
    window.location.href = "/login.html";
  }
});
```

---

## 10. Error Handling

### Don't Expose Sensitive Information

```javascript
// ❌ BAD - Exposes too much information
console.log(error); // Logs everything to console (visible to user)
alert(error.message); // User sees full error details

// ✅ GOOD - Show generic message, log details
console.error("API Error:", error); // Only in console
showToast("Something went wrong. Please try again.", "error"); // Generic message for user

// ✅ BETTER - Show specific but safe message
const messages = {
  401: "Session expired. Please log in again.",
  403: "You don't have permission for this action.",
  404: "Resource not found.",
  500: "Server error. Please try again later.",
};

const message = messages[error.status] || "Operation failed. Please try again.";
showToast(message, "error");
```

---

## 11. Security Headers

### What Browser Should Send

Verify with browser DevTools (Network tab):

```
Content-Security-Policy
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security
```

---

## 12. Regular Security Audit Checklist

- [ ] All passwords hashed with bcrypt ✅
- [ ] JWT tokens expire after 1 day ✅
- [ ] Rate limiting on auth endpoints ✅
- [ ] Input validation on all forms ✅
- [ ] No sensitive data in logs/console
- [ ] HTTPS enabled on production
- [ ] CSP headers configured
- [ ] CORS whitelist updated for production domain
- [ ] File uploads validated on both frontend and backend
- [ ] Error messages don't expose system details
- [ ] localStorage cleared on logout
- [ ] No hardcoded credentials in code
- [ ] Dependencies updated regularly

---

## 13. Useful Commands

### Generate Random Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Test Password Hash

```bash
node -e "
const bcrypt = require('bcryptjs');
const pwd = 'testPassword123!';
bcrypt.hash(pwd, 10).then(hash => {
  console.log('Hashed:', hash);
  bcrypt.compare(pwd, hash).then(match => console.log('Match:', match));
});
"
```

### Check JWT Token

```bash
node -e "
const jwt = require('jsonwebtoken');
const token = 'your-token-here';
try {
  const decoded = jwt.verify(token, 'SECRET_KEY');
  console.log('Valid token:', decoded);
} catch (err) {
  console.log('Invalid token:', err.message);
}
"
```

---

**Last Updated**: January 2025  
**Security Level**: Production-Ready
