import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import pool from "./db.js";
import { authenticate } from "./auth.js";
import { requirePermission } from "./permissions.js";

const ACTIONS = new Set(["ai_qualify_lead", "create_followup_reminder"]);
const STAGES = new Set(["new", "contacted", "qualified", "proposal", "won", "lost"]);
const STATUSES = new Set(["new", "warm", "hot", "cold"]);

export function registerAutomationRoutes(app) {
  app.get("/api/automations", authenticate, requirePermission("automation:view"), async (req, res) => {
    try {
      const [rules, runs] = await Promise.all([
        pool.query(
          `SELECT id, name, trigger_event, action_type, config, is_enabled, created_at, updated_at
           FROM business_automations WHERE business_id=$1 ORDER BY created_at DESC`,
          [req.user.businessId]
        ),
        pool.query(
          `SELECT r.id, r.automation_id, a.name AS automation_name, r.lead_id,
                  r.status, r.result, r.error, r.created_at
           FROM business_automation_runs r
           LEFT JOIN business_automations a
             ON a.id=r.automation_id AND a.business_id=r.business_id
           WHERE r.business_id=$1 ORDER BY r.created_at DESC LIMIT 30`,
          [req.user.businessId]
        )
      ]);
      res.json({ automations: rules.rows, runs: runs.rows });
    } catch (error) {
      console.error("Automation load error:", error);
      res.status(500).json({ error: "Could not load automations." });
    }
  });

  app.post("/api/automations", authenticate, requirePermission("automation:manage"), async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const action = String(req.body?.actionType || "");
      const delay = Number(req.body?.delayHours ?? 24);

      if (!name || name.length > 80) {
        return res.status(400).json({ error: "Rule name must be 1–80 characters." });
      }
      if (!ACTIONS.has(action)) {
        return res.status(400).json({ error: "Select a valid automation action." });
      }
      if (!Number.isInteger(delay) || delay < 1 || delay > 720) {
        return res.status(400).json({ error: "Follow-up delay must be 1–720 hours." });
      }

      const count = await pool.query(
        "SELECT COUNT(*)::int AS total FROM business_automations WHERE business_id=$1",
        [req.user.businessId]
      );
      if (count.rows[0].total >= 20) {
        return res.status(400).json({ error: "Maximum 20 automation rules allowed per business." });
      }

      const result = await pool.query(
        `INSERT INTO business_automations
         (id,business_id,created_by,name,trigger_event,action_type,config,is_enabled)
         VALUES ($1,$2,$3,$4,'lead.created',$5,$6::jsonb,FALSE)
         RETURNING id,name,trigger_event,action_type,config,is_enabled,created_at`,
        [
          randomUUID(), req.user.businessId, req.user.id, name, action,
          JSON.stringify({ delayHours: delay })
        ]
      );
      res.status(201).json({ automation: result.rows[0] });
    } catch (error) {
      console.error("Automation create error:", error);
      res.status(500).json({ error: "Could not create automation." });
    }
  });

  app.patch("/api/automations/:id", authenticate, requirePermission("automation:manage"), async (req, res) => {
    try {
      if (typeof req.body?.isEnabled !== "boolean") {
        return res.status(400).json({ error: "isEnabled must be true or false." });
      }
      const result = await pool.query(
        `UPDATE business_automations SET is_enabled=$1,updated_at=NOW()
         WHERE id=$2 AND business_id=$3
         RETURNING id,name,is_enabled`,
        [req.body.isEnabled, req.params.id, req.user.businessId]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Automation not found." });
      res.json({ automation: result.rows[0] });
    } catch (error) {
      console.error("Automation update error:", error);
      res.status(500).json({ error: "Could not update automation." });
    }
  });

  app.delete("/api/automations/:id", authenticate, requirePermission("automation:manage"), async (req, res) => {
    try {
      const result = await pool.query(
        "DELETE FROM business_automations WHERE id=$1 AND business_id=$2 RETURNING id",
        [req.params.id, req.user.businessId]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Automation not found." });
      res.json({ success: true });
    } catch (error) {
      console.error("Automation delete error:", error);
      res.status(500).json({ error: "Could not delete automation." });
    }
  });
}

export async function runLeadCreatedAutomations(businessId, leadId) {
  const rules = await pool.query(
    `SELECT id,name,action_type,config FROM business_automations
     WHERE business_id=$1 AND trigger_event='lead.created' AND is_enabled=TRUE`,
    [businessId]
  );

  for (const rule of rules.rows) {
    let runId = null;
    try {
      const inserted = await pool.query(
        `INSERT INTO business_automation_runs
         (id,business_id,automation_id,lead_id,status)
         VALUES ($1,$2,$3,$4,'running')
         ON CONFLICT (automation_id,lead_id) DO NOTHING
         RETURNING id`,
        [randomUUID(), businessId, rule.id, leadId]
      );
      if (!inserted.rows.length) continue;
      runId = inserted.rows[0].id;

      const leadResult = await pool.query(
        `SELECT id,name,contact,status,notes,pipeline_stage,assigned_to
         FROM leads WHERE id=$1 AND business_id=$2 LIMIT 1`,
        [leadId, businessId]
      );
      if (!leadResult.rows.length) throw new Error("Lead not found in this workspace.");
      const lead = leadResult.rows[0];
      let resultData = {};

      if (rule.action_type === "create_followup_reminder") {
        const hours = Math.min(720, Math.max(1, Number(rule.config?.delayHours) || 24));
        const dueAt = new Date(Date.now() + hours * 3600000);
        const reminder = await pool.query(
          `INSERT INTO reminders
           (id,business_id,created_by,assigned_to,title,description,type,due_at,priority,status)
           VALUES ($1,$2,NULL,$3,$4,$5,'follow_up',$6,'medium','pending')
           RETURNING id,title,due_at`,
          [
            randomUUID(), businessId, lead.assigned_to,
            `Follow up: ${lead.name}`,
            `Automatic follow-up reminder for lead ${lead.name}.`,
            dueAt
          ]
        );
        resultData = { reminder: reminder.rows[0] };
      } else if (rule.action_type === "ai_qualify_lead") {
        const ai = new GoogleGenAI({});
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash-lite",
          contents: `Assess this business lead. Return ONLY JSON with keys status, pipeline_stage, reason.
Allowed status: new,warm,hot,cold. Allowed pipeline_stage: new,contacted,qualified,proposal,won,lost.
Do not invent facts. Use conservative estimates.
Lead: ${JSON.stringify({
            name: lead.name, contact: lead.contact, notes: lead.notes, status: lead.status
          })}`,
          config: { temperature: 0.1 }
        });
        const raw = String(response.text || "").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);
        const status = STATUSES.has(parsed.status) ? parsed.status : lead.status;
        const stage = STAGES.has(parsed.pipeline_stage) ? parsed.pipeline_stage : lead.pipeline_stage;
        const reason = String(parsed.reason || "AI lead assessment").slice(0, 500);
        await pool.query(
          `UPDATE leads SET status=$1,pipeline_stage=$2,
           notes=CONCAT(COALESCE(notes,''), CASE WHEN COALESCE(notes,'')='' THEN '' ELSE E'\\n' END,
           '[AI qualification] ', $3),updated_at=NOW()
           WHERE id=$4 AND business_id=$5`,
          [status, stage, reason, leadId, businessId]
        );
        resultData = { status, pipeline_stage: stage, reason };
      } else {
        throw new Error("Unsupported automation action.");
      }

      await pool.query(
        `UPDATE business_automation_runs SET status='success',result=$1::jsonb,completed_at=NOW()
         WHERE id=$2 AND business_id=$3`,
        [JSON.stringify(resultData), runId, businessId]
      );
    } catch (error) {
      console.error("Automation execution error:", error);
      if (runId) {
        await pool.query(
          `UPDATE business_automation_runs SET status='failed',error=$1,completed_at=NOW()
           WHERE id=$2 AND business_id=$3`,
          [String(error.message || "Automation failed").slice(0, 500), runId, businessId]
        ).catch(() => {});
      }
    }
  }
}
