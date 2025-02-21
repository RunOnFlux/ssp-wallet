# Contributing to SSP Wallet

We’re excited that you’re considering contributing to SSP Wallet! Your contributions are vital for making the wallet more secure, user-friendly, and powerful. Whether you’re reporting bugs, suggesting new features, or improving the codebase, we value your efforts.

For detailed technical information and guidelines, refer to the [SSP Wallet Documentation](https://docs.sspwallet.io).

---

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project, you agree to uphold a respectful and welcoming environment for everyone.

---

## Ways to Contribute

### 1. Report Bugs
If you discover a bug:
- [Create an issue](https://github.com/RunOnFlux/ssp-wallet/issues) and provide:
  - Steps to reproduce the issue.
  - Screenshots, logs, or error messages if applicable.
  - Information about your setup (OS, browser, device).

### 2. Suggest Features
Have an idea to improve SSP Wallet? Open a feature request in the [issues section](https://github.com/RunOnFlux/ssp-wallet/issues). Be as detailed as possible and include the problem it solves.

### 3. Improve Documentation
Help us make SSP Wallet more accessible by contributing to guides, FAQs, or translations via [Crowdin](https://crowdin.com/project/sspwallet). For detailed technical documentation, visit the [SSP Wallet Docs](https://docs.sspwallet.io).

### 4. Submit Code Contributions
Help us build new features, fix bugs, or improve existing code by submitting a pull request (PR).

---

## Development Environment

### Prerequisites
- **Node.js**: Version 20 or higher
- **Yarn**: Latest version

### Setting Up
1. Fork the repository.
2. Clone your fork:
   ```bash
   git clone https://github.com/runonflux/ssp-wallet
   ```
3. Install dependencies:
   ```bash
   yarn install
   ```
4. Start the development server:
   ```bash
   yarn dev
   ```

Refer to the [Documentation](https://docs.sspwallet.io/) for more details.

---

## Coding Guidelines

### Style Guide
- Follow our **ESLint configuration** and use **Prettier** for code formatting.  
- Run the linter before committing your changes:
  ```bash
  yarn lint
  ```
- Code must conform to the project’s established conventions.

### Prettier Configuration
This project uses Prettier for consistent formatting. Ensure your editor supports Prettier.

### Type Checking
This project uses TypeScript for type checking. Ensure your editor supports TypeScript, or run:
```bash
yarn type-check
```


### Testing
- Write tests for new features or bug fixes.
- Run tests locally to ensure all tests pass:
  ```bash
  yarn test
  ```

---

## Submitting a Pull Request

Follow these steps to submit a PR:

1. **Create a New Branch**  
   Use a descriptive branch name:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**  
   - Keep changes focused and avoid combining unrelated updates.  
   - Ensure tests and linter checks pass before committing.

3. **Commit Changes**  
   Write clear, descriptive commit messages:
   ```bash
   git commit -m "Add feature: your-feature-description"
   ```

4. **Push to Your Fork**  
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request**  
   - Go to your fork and create a pull request against the `main` branch of the SSP Wallet repository.
   - Describe your changes, linking to any relevant issues.

### PR Tips
- Adhere to our coding standards and include tests.
- Ensure your PR only contains changes related to the specific issue or feature.
- For significant changes, open a draft PR to get early feedback.

---

## Resources

- [SSP Wallet Documentation](https://docs.sspwallet.io)  
- [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/)  
- [GitHub Help](https://help.github.com)  

---

## Need Help?

If you have questions or run into issues:
- Open an issue on GitHub.
- Refer to the [SSP Wallet Documentation](https://docs.sspwallet.io).  
- Join the community via [SSP Wallet Discord](https://discord.gg/runonflux).

We look forward to your contributions. Together, let’s make SSP Wallet a secure, simple, and powerful tool for everyone!
