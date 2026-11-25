import { useCallback, useEffect, useState } from "react";

const API = "/api";
const emptyForm = {
  title: "",
  description: "",
  type: "follow_up",
  dueAt: "",
  priority: "medium",
  assignedTo: ""
};

const labels = {
  follow_up: "Follow-up",
  meeting: "Meeting",
  task: "Important task"
};

function localDate(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}


function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

export default function Reminders({ token, onClose }) {
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [canWrite, setCanWrite] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [reminderResponse, teamResponse] = await Promise.all([
        fetch(`${API}/reminders`, { headers }),
        fetch(`${API}/reminders/team`, { headers })
      ]);

      const [reminderData, teamData] = await Promise.all([
        reminderResponse.json(),
        teamResponse.json()
      ]);

      if (!reminderResponse.ok) {
        throw new Error(reminderData.error || "Could not load reminders.");
      }

      if (!teamResponse.ok) {
        throw new Error(teamData.error || "Could not load employees.");
      }

      setItems(reminderData.reminders || []);
      setMembers(teamData.members || []);
      setCanWrite(reminderData.canWrite === true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function updateField(key, value) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditing(null);
  }

  async function saveReminder(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!form.title.trim() || !form.dueAt) {
      setError("Title and due date/time are required.");
      return;
    }

    if (!Number.isFinite(new Date(form.dueAt).getTime())) {
      setError("Please select a valid date and time.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        editing ? `${API}/reminders/${editing}` : `${API}/reminders`,
        {
          method: editing ? "PATCH" : "POST",
          headers,
          body: JSON.stringify({
            ...form,
            title: form.title.trim(),
            description: form.description.trim(),
            dueAt: new Date(form.dueAt).toISOString()
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save reminder.");
      }

      resetForm();
      setMessage(editing ? "Reminder updated successfully." : "Reminder created successfully.");
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function editReminder(item) {
    setEditing(item.id);
    setForm({
      title: item.title,
      description: item.description || "",
      type: item.type,
      dueAt: localDate(item.due_at),
      priority: item.priority,
      assignedTo: item.assigned_to || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function changeStatus(item, status) {
    try {
      setError("");
      const response = await fetch(`${API}/reminders/${item.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          title: item.title,
          description: item.description || "",
          type: item.type,
          dueAt: item.due_at,
          priority: item.priority,
          assignedTo: item.assigned_to || "",
          status
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Status update failed.");

      setMessage(status === "completed" ? "Task completed!" : "Task reopened.");
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteReminder(id) {
    if (!window.confirm("Delete this reminder permanently?")) return;

    try {
      const response = await fetch(`${API}/reminders/${id}`, {
        method: "DELETE",
        headers
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Delete failed.");

      setMessage("Reminder deleted.");
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  const pending = items.filter(item => item.status === "pending");
  const completed = items.filter(item => item.status === "completed");
  const overdue = items.filter(item => item.display_status === "overdue");

  const filtered = items.filter(item => {
    if (filter === "pending") return item.status === "pending" && item.display_status !== "overdue";
    if (filter === "overdue") return item.display_status === "overdue";
    if (filter === "completed") return item.status === "completed";
    return true;
  });

  return (
    <main className="reminders-page">
      <header className="reminders-topbar">
        <div>
          <span className="reminders-eyebrow">BUSINESS WORKSPACE</span>
          <h1>🔔 Reminders & Tasks</h1>
          <p>Never miss a follow-up, meeting or important task.</p>
        </div>
        <button className="reminders-back" onClick={onClose}>← Back</button>
      </header>

      {error && <div className="reminders-alert error">{error}</div>}
      {message && <div className="reminders-alert success">{message}</div>}

      <section className="reminders-stats">
        <article><span>All reminders</span><strong>{items.length}</strong><small>Everything in your workspace</small></article>
        <article><span>Pending</span><strong>{pending.length}</strong><small>Tasks to complete</small></article>
        <article><span>Overdue</span><strong>{overdue.length}</strong><small>Needs your attention</small></article>
        <article><span>Completed</span><strong>{completed.length}</strong><small>Successfully finished</small></article>
      </section>

      {!canWrite && (
        <div className="reminders-alert">
          Read-only access: your role cannot create or modify reminders.
        </div>
      )}

      {canWrite && <section className="reminders-form-card">
        <div className="reminders-section-heading">
          <div>
            <span className="reminders-eyebrow">{editing ? "UPDATE TASK" : "GET ORGANIZED"}</span>
            <h2>{editing ? "Edit reminder" : "Create a reminder"}</h2>
          </div>
          <span className="reminders-form-icon">✦</span>
        </div>

        <form onSubmit={saveReminder} className="reminders-form">
          <label className="reminders-field full">
            Reminder title *
            <input maxLength={160} value={form.title}
              onChange={e => updateField("title", e.target.value)}
              placeholder="e.g. Follow up with Rahul" required />
          </label>

          <label className="reminders-field">
            Category
            <select value={form.type} onChange={e => updateField("type", e.target.value)}>
              <option value="follow_up">📩 Follow-up</option>
              <option value="meeting">🤝 Meeting</option>
              <option value="task">📌 Important task</option>
            </select>
          </label>

          <label className="reminders-field">
            Priority
            <select value={form.priority} onChange={e => updateField("priority", e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          <label className="reminders-field">
            Due date & time *
            <input type="datetime-local" value={form.dueAt}
              onChange={e => updateField("dueAt", e.target.value)} required />
          </label>

          <label className="reminders-field">
            Assign employee
            <select value={form.assignedTo}
              onChange={e => updateField("assignedTo", e.target.value)}>
              <option value="">Unassigned</option>
              {members.map(member => (
                <option key={member.id} value={member.id}>
                  {member.name} ({member.role})
                </option>
              ))}
            </select>
          </label>

          <label className="reminders-field full">
            Description
            <textarea maxLength={3000} rows={3} value={form.description}
              onChange={e => updateField("description", e.target.value)}
              placeholder="Add task details or meeting notes..." />
          </label>

          <div className="reminders-form-actions full">
            {editing && <button type="button" className="reminders-cancel" onClick={resetForm}>Cancel</button>}
            <button type="submit" className="reminders-submit" disabled={saving}>
              {saving ? "Saving..." : editing ? "Save changes" : "+ Create reminder"}
            </button>
          </div>
        </form>
      </section>}

      <section className="reminders-list-section">
        <div className="reminders-list-heading">
          <div><h2>Your reminders</h2><p>Track and manage your business tasks.</p></div>
          <button onClick={loadData} className="reminders-refresh">↻ Refresh</button>
          <button
            type="button"
            className="reminders-refresh"
            onClick={async () => {
              setError("");
              setMessage("");
              try {
                if (!("Notification" in window) ||
                    !("serviceWorker" in navigator) ||
                    !("PushManager" in window) ||
                    !window.isSecureContext) {
                  throw new Error("Background push needs a supported browser and secure HTTPS connection.");
                }

                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                  throw new Error("Notification permission was not granted. Please allow notifications in Android browser settings.");
                }

                const keyResponse = await fetch(`${API}/push/public-key`, { headers });
                const keyData = await keyResponse.json();
                if (!keyResponse.ok || !keyData.publicKey) {
                  throw new Error(keyData.error || "Push notifications are not configured on the server yet.");
                }

                const registration = await navigator.serviceWorker.register("/sw.js");
                await navigator.serviceWorker.ready;
                let subscription = await registration.pushManager.getSubscription();

                if (!subscription) {
                  subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
                  });
                }

                const saveResponse = await fetch(`${API}/push/subscribe`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ subscription: subscription.toJSON() })
                });
                const saveData = await saveResponse.json();
                if (!saveResponse.ok) {
                  throw new Error(saveData.error || "Could not save this device subscription.");
                }

                setMessage("Background notifications enabled on this device. Assigned employees must enable notifications on their own devices too.");
              } catch (err) {
                setError(err.message || "Could not enable background notifications.");
              }
            }}
          >
            🔔 Enable notifications
          </button>
        </div>

        <div className="reminders-filters">
          {[
            ["all", "All"],
            ["pending", "Pending"],
            ["overdue", "Overdue"],
            ["completed", "Completed"]
          ].map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)}
              className={filter === value ? "active" : ""}>{label}</button>
          ))}
        </div>

        {loading ? <div className="reminders-empty">Loading reminders...</div> :
          filtered.length === 0 ? (
            <div className="reminders-empty">
              <span>📭</span>
              <h3>No reminders found</h3>
              <p>Create your first reminder using the form above.</p>
            </div>
          ) : (
            <div className="reminders-list">
              {filtered.map(item => (
                <article className={`reminder-card ${item.display_status}`} key={item.id}>
                  <div className="reminder-card-main">
                    <div className="reminder-card-title">
                      <span className={`reminder-priority ${item.priority}`}>{item.priority}</span>
                      <span className={`reminder-status ${item.display_status}`}>
                        {item.display_status === "overdue" ? "OVERDUE" : item.status.toUpperCase()}
                      </span>
                    </div>
                    <h3>{item.title}</h3>
                    <p className="reminder-category">{labels[item.type]} · Assigned: {item.assigned_to_name || "Unassigned"}</p>
                    {item.description && <p className="reminder-description">{item.description}</p>}
                    <p className="reminder-date">🕒 {new Date(item.due_at).toLocaleString()}</p>
                  </div>
                  {canWrite && <div className="reminder-actions">
                    {item.status === "pending" ?
                      <button onClick={() => changeStatus(item, "completed")}>✓ Complete</button> :
                      <button onClick={() => changeStatus(item, "pending")}>↺ Reopen</button>}
                    <button onClick={() => editReminder(item)}>✎ Edit</button>
                    <button className="delete" onClick={() => deleteReminder(item.id)}>Delete</button>
                  </div>}
                </article>
              ))}
            </div>
          )}
      </section>
    </main>
  );
}
