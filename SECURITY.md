# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x (current) | ✅ |

## Reporting a Vulnerability

We take the security of PalSafar seriously. If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue.** Instead, send a private report to the repository owner.

### How to Report

1. **Email:** Send details to the repository owner via GitHub's private vulnerability reporting feature
2. **GitHub:** Use the "Report a vulnerability" link under the repository's Security tab
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Affected versions
   - Potential impact
   - Any suggested fix (if available)

### What to Expect

- **Acknowledgment:** Within 48 hours of your report
- **Investigation:** We will investigate and might reach out for additional details
- **Fix Timeline:** Critical vulnerabilities are prioritized and typically fixed within 7 days
- **Disclosure:** We coordinate disclosure with you once a fix is deployed

## Scope

This security policy covers:

- The PalSafar mobile application
- The PalSafar API server
- The PalSafar admin dashboard
- Authentication and authorization systems
- Data storage and transmission
- Third-party integrations (Firebase, Cloudinary, Razorpay, Sentry)

## Out of Scope

- Issues in third-party dependencies (report to the respective maintainer)
- Theoretical attacks without a practical proof of concept
- Social engineering attacks
- Physical security

## Security Best Practices

### For Contributors

- Never commit `.env` files, secrets, or credentials
- Use environment variables for all sensitive configuration
- Run secret scanners before committing
- Review diffs for accidentally included secrets
- Use `.env.example` files for documentation only

### For Deployments

- Rotate all secrets before production deployment
- Use CI/CD secrets for environment variables
- Never store secrets in source code or build artifacts
- Enable branch protection on `main`
- Require PR reviews for all changes
