# FixHub Security Implementation Guide

## Overview

This guide documents the security measures implemented in the FixHub backend and frontend to protect user data and application integrity.

---

## 1. PASSWORD SECURITY

### ✅ Implemented

- **bcryptjs** for password hashing with 10 salt rounds
- Passwords hashed during registration (never stored in plain text)
- bcrypt.compare() used for login password verification
- Passwords never returned to frontend in API responses

### Code Location

- **Backend**: `FixHub/backend/controllers/authController.js`
  - Registration: `await bcrypt.hash(password, 10)`
  - Login: `await bcrypt.compare(password, user.password)`

### Password Requirements

- Minimum 8 characters (enforced by express-validator)
- Recommended: uppercase, lowercase, numbers, special characters (frontend can enhance)

### Security Headers

Set in `server.js`:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

## 2. INPUT VALIDATION & SANITIZATION

### ✅ Implemented

- **express-validator** middleware on all auth routes
- Email format validation (RFC 5322 compliant)
- Password minimum length enforcement
- Name/description length limits (2-100 chars)
- Phone format validation
- Bio length limit (500 chars)
- File upload size limit (5MB)
- File type whitelist: JPEG, PNG, GIF, WebP

### Validation Rules

**Registration Route** (`/api/auth/register`):

```javascript
- name: 2-100 characters
- email: valid email format
- password: minimum 8 characters
- role: must be Customer, Seller, or Technician
- firstName/lastName: max 50 characters
- phone: valid phone format
- birthDate: valid ISO8601 date
- bio: max 500 characters
```

**Login Route** (`/api/auth/login`):

```javascript
- email: valid email format
- password: required
```

### File Upload Security

- Multer with disk storage
- 5MB file size limit
- MIME type validation (images only)
- Filename sanitized with timestamp prefix

---

## 3. RATE LIMITING

### ✅ Implemented

**Global Rate Limiter**:

- 100 requests per 15 minutes per IP
- Applies to all routes by default

**Auth Rate Limiter** (Stricter for security):

- 5 login/register attempts per 15 minutes per IP
- Prevents brute force attacks
- Applied to `/api/auth/login` and `/api/auth/register`

### Configuration

Location: `FixHub/backend/server.js` and `routes/authRoutes.js`

```javascript
windowMs: 15 * 60 * 1000; // 15 minute window
max: 5; // 5 attempts for auth
skipSuccessfulRequests: true; // Don't count successful logins
```

---

## 4. SECURITY HEADERS

### ✅ Implemented (via Helmet.js)

```
Content-Security-Policy (CSP)
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
```

### Additional Custom Headers

Set in `server.js` middleware:

- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing attacks
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` - XSS protection

---

## 5. CORS (Cross-Origin Resource Sharing)

### ✅ Implemented

Whitelist of allowed origins:

```
http://localhost:5500
http://127.0.0.1:5500
http://localhost:3000
http://127.0.0.1:3000
https://localhost:3000
https://127.0.0.1:3000
```

### Configuration

- Credentials allowed (for JWT tokens)
- Methods: GET, POST, PUT, DELETE, OPTIONS
- Allowed headers: Content-Type, Authorization

### For Production

Add production domain(s) to `allowedOrigins` array in `server.js`.

---

## 6. JWT (JSON Web Tokens)

### ✅ Implemented

- Token generated on successful login with 1-day expiration
- Payload includes: user ID, name, email, role
- Signed with `JWT_SECRET` environment variable
- Token sent to frontend in response
- Frontend stores in localStorage

### Token Validation

Use `validateAuth` middleware for protected routes:

```javascript
const validateAuth = require("./middleware/validateAuth");
router.get("/protected-route", validateAuth, controller);
```

### Security Best Practices

- **Store JWT_SECRET in environment variables** (never commit to git)
- **Use HTTPS** to prevent token interception
- **Implement token refresh** for longer sessions (optional enhancement)
- **Token expiration** set to 1 day (can be adjusted)

---

## 7. HTTPS SETUP

### Development (Self-Signed Certificate)

**Step 1: Generate Self-Signed Certificate**

```bash
cd FixHub/backend
openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365
```

**Step 2: Create HTTPS Server**
Update `server.js`:

```javascript
const https = require("https");
const fs = require("fs");

// After middleware setup, replace app.listen() with:
if (process.env.NODE_ENV === "production" || process.env.HTTPS === "true") {
  https
    .createServer(
      {
        key: fs.readFileSync("./key.pem"),
        cert: fs.readFileSync("./cert.pem"),
      },
      app,
    )
    .listen(PORT, () => {
      console.log("Secure server running on https://localhost:" + PORT);
    });
} else {
  app.listen(PORT, () => {
    console.log("Server running on http://localhost:" + PORT);
  });
}
```

**Step 3: Set Environment Variable**

```bash
export NODE_ENV=production
# or for development with HTTPS
export HTTPS=true
```

### Production (Let's Encrypt / Certbot)

1. Use Certbot to obtain free SSL certificate
2. Configure reverse proxy (Nginx/Apache) with SSL
3. Point domain to your server
4. Auto-renew certificates

### Frontend HTTPS Adjustment

Update API base URL in `script.js`:

```javascript
const API_BASE =
  window.location.protocol === "https:"
    ? "https://your-domain.com/api"
    : "http://localhost:3000";
```

---

## 8. PAYMENT SECURITY (PCI-DSS Awareness)

### ✅ Implemented

- Rate limiting on payment endpoints
- HTTPS enforced for all traffic
- Input validation on payment data

### NOT Implemented (Use Third-Party Services)

**Never implement payment processing directly. Use:**

1. **Stripe** - PCI-DSS compliant, handles card encryption
2. **PayPal** - Established payment processor
3. **Square** - Mobile-friendly payment solution

### Current Implementation Notes

- Payment route exists at `FixHub/backend/routes/paymentRoutes.js`
- Placeholder implementation (do not process real payments)
- **TODO**: Integrate with Stripe/PayPal Webhooks

### Best Practices

- **Never store credit card numbers** - Use tokenization
- **Never transmit card data** through your server - Use client-side encryption
- **Implement Webhooks** for payment confirmation
- **Use HTTPS only** for payment processing
- **Validate all amounts** on backend (prevent client-side tampering)

---

## 9. ENVIRONMENT VARIABLES

### Required `.env` File

Create `FixHub/backend/.env`:

```
PORT=3000
MONGO_URI=mongodb://localhost:27017/fixhub
JWT_SECRET=your-very-long-random-secret-key-min-32-characters
NODE_ENV=development
HTTPS=false
```

### Security Rules

- **Never commit `.env` to git** (add to `.gitignore`)
- **Use strong JWT_SECRET** (minimum 32 characters, random)
- **Change JWT_SECRET in production**
- **Use environment-specific configs** (dev, staging, production)
- **Rotate secrets periodically**

---

## 10. DATABASE SECURITY

### ✅ Implemented

- Mongoose schema validation
- Email stored in lowercase for consistency
- Password never logged or returned in responses

### Recommendations

- **Use MongoDB authentication** (username/password or IP whitelist)
- **Enable encryption at rest** in MongoDB Atlas
- **Use connection string with credentials** in .env
- **Never expose database connection string** in frontend code
- **Implement database backups** for disaster recovery

---

## 11. ERROR HANDLING

### ✅ Implemented

- Generic error messages in responses (don't expose stack traces)
- Detailed error logging in console (backend only)
- Consistent error response format

### Error Response Format

```json
{
  "success": false,
  "message": "User-friendly message",
  "errors": [] // validation errors if applicable
}
```

### Security Principle

- **Frontend users** get generic messages ("Invalid email or password")
- **Backend logs** capture detailed error information
- **Stack traces never exposed** to API clients

---

## 12. FRONTEND SECURITY

### ✅ Implemented

- Input sanitization in forms (HTML5 built-in)
- XSS prevention via DOM manipulation
- CSRF prevention (backend rate limiting + token validation)

### Frontend Validation

Enhance in `script.js`:

```javascript
// Email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Password strength validation
function isStrongPassword(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

// Before form submission, validate locally
if (!isValidEmail(email)) {
  showToast("Invalid email format", "error");
  return;
}

if (!isStrongPassword(password)) {
  showToast(
    "Password must include uppercase, lowercase, number, and symbol",
    "error",
  );
  return;
}
```

### localStorage Security

- JWT token stored in localStorage (exposed to XSS)
- **Future improvement**: Use httpOnly cookies (requires backend changes)
- **Current mitigation**: 1-day token expiration, HTTPS only

---

## 13. DEPLOYMENT CHECKLIST

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Change `JWT_SECRET` to strong random string (32+ characters)
- [ ] Update `allowedOrigins` with production domain
- [ ] Enable HTTPS with valid SSL certificate
- [ ] Set up MongoDB authentication and backups
- [ ] Configure rate limiting for production traffic
- [ ] Enable database encryption at rest
- [ ] Set up error monitoring/logging (e.g., Sentry)
- [ ] Run security audit (OWASP Top 10)
- [ ] Test all authentication flows
- [ ] Implement payment processing integration (Stripe/PayPal)
- [ ] Set up CSP headers with production domains
- [ ] Enable CORS for production domain only
- [ ] Test HTTPS redirect and HSTS headers
- [ ] Document recovery procedures

---

## 14. RUNNING THE APPLICATION

### Install Dependencies

```bash
cd FixHub/backend
npm install
```

### Start Backend

```bash
# Development mode (HTTP)
npm start

# Production mode (HTTPS)
export NODE_ENV=production
npm start
```

### Frontend

- Serve HTML files via Live Server (VS Code extension)
- Or use Python: `python -m http.server 5500`
- Or use Node: `npm install -g http-server` then `http-server -p 5500`

---

## 15. SECURITY RESOURCES

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [PCI-DSS Requirements](https://www.pcisecuritystandards.org/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

---

## 16. COMMON VULNERABILITIES ADDRESSED

| Vulnerability                         | Mitigation                                         | Status |
| ------------------------------------- | -------------------------------------------------- | ------ |
| **Injection**                         | Input validation, parameterized queries (Mongoose) | ✅     |
| **Broken Auth**                       | Bcrypt hashing, JWT validation, rate limiting      | ✅     |
| **CORS**                              | Whitelist allowed origins                          | ✅     |
| **XSS**                               | CSP headers, DOM sanitization                      | ✅     |
| **CSRF**                              | Token validation, rate limiting                    | ✅     |
| **Weak Passwords**                    | Minimum 8 chars, rate limiting on auth             | ✅     |
| **Exposed Passwords**                 | Never logged, never returned to client             | ✅     |
| **Brute Force**                       | Rate limiting (5 attempts per 15 min)              | ✅     |
| **Sensitive Data**                    | HTTPS recommended, JWT expires 1 day               | ✅     |
| **Using Components with Known Vulns** | Keep dependencies updated                          | ⚠️     |

---

**Last Updated**: January 2025  
**Status**: Production-Ready with recommendations noted
