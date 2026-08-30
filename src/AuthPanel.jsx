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

    const cleanEmail = email.trim().toLowerCase();

    if (mode === "register") {
      if (
        !name.trim() ||
        !cleanEmail ||
        !password ||
        !businessName.trim()
      ) {
        setError("Name, email, password and business name are required.");
        return;
      }

      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
    } else {
      if (!cleanEmail || !password) {
        setError("Email and password are required.");
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
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(
            mode === "login"
              ? {
                  email: cleanEmail,
                  password
                }
              : {
                  name: name.trim(),
                  email: cleanEmail,
                  password,
                  businessName: businessName.trim(),
                  industry: industry.trim()
                }
          )
        }
      );

      const rawText = await response.text();

      let data = {};

      if (rawText.trim()) {
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error(
            `Server returned an invalid response (${response.status}).`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
          `Authentication failed (${response.status}).`
        );
      }

      if (!data?.token) {
        throw new Error("Authentication token was not returned.");
      }

      localStorage.setItem("vikop-auth-token", data.token);

      if (data.user) {
        localStorage.setItem(
          "vikop-auth-user",
          JSON.stringify(data.user)
        );
      }

      onLogin(data.token, data.user || null);
    } catch (err) {
      console.error("Authentication error:", err);

      setError(
        err?.message ||
        "Unable to connect to the server. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-panel">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-icon">🐟</div>

          <h2>
            VikoP <span>AI</span>
          </h2>

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
            disabled={loading}
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
            disabled={loading}
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
                  disabled={loading}
                />
              </div>

              <div className="auth-field">
                <label>Business Name</label>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your company name"
                  autoComplete="organization"
                  disabled={loading}
                />
              </div>

              <div className="auth-field">
                <label>Industry</label>
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Real Estate, Gym, Restaurant..."
                  disabled={loading}
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
              disabled={loading}
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
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
              disabled={loading}
            />
          </div>

          {error && (
            <div className="auth-error" role="alert">
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
