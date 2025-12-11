export const selectors = {
  loginButton: 'a[href="/login"]',
  emailInput: 'input[name="employee_id"], input[type="email"], input[name="email"], #email',
  passwordInput: 'input[name="password"], input[type="password"][name="password"], #password',
  companyIdInput: 'input[name="companyId"], #companyId, input[placeholder*="Company" i], input[placeholder*="Organisasi" i]',
  submitButton: 'button[type="submit"], button[data-sentry-component="SubmitButton"]',
};
