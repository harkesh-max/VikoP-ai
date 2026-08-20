import { useState } from "react";

export default function AuthPanel({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (mode === "register") {
      if (!name.trim() || !email.trim() || !password || !businessName.trim()) {
        setError("Name, email, password and business name are required.");
        return;
      }
    }

    try {
      setLoading(true);

      const response = await fetch(
        mode === "login"
          ? "/api/auth/login"
          : "/api/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(
            mode === "login"
              ? {
                  email: email.trim(),
                  password
                }
              : {
                  name: name.trim(),
                  email: email.trim(),
                  password,
                  businessName: businessName.trim(),
                  industry: industry.trim()
                }
          )
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      if (!data.token) {
        throw new Error("Authentication token was not returned.");
      }

      localStorage.setItem("vikop-auth-token", data.token);

      if (data.user) {
        localStorage.setItem(
          "vikop-auth-user",
          JSON.stringify(data.user)
        );
      }

      onLogin(data.token);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-panel">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-icon">🐟</div>
          <h2>VikoP <span>AI</span></h2>
          <p>
            {mode === "login"
              ? "Login to your business workspace"
              : "Create your business workspace"}
          </p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Login
          </button>

          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <div className="auth-field">
                <label>Your Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>

              <div className="auth-field">
                <label>Business Name</label>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your company name"
                  autoComplete="organization"
                />
              </div>

              <div className="auth-field">
                <label>Industry</label>
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Real Estate, Gym, Restaurant..."
                />
              </div>
            </>
          )}

          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </div>

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Login"
                : "Create Business Account"}
          </button>
        </form>

        <small className="auth-note">
          Your business account keeps your company workspace separate from
          other businesses.
        </small>
      </div>
    </section>
  );
}
