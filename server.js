require("dotenv").config();

const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors({ origin: "*" }));
app.use(bodyParser.json());

// ── Static files ──────────────────────────────────────────────
// Serve admin panel and blog detail page
app.use(express.static(path.join(__dirname, "public")));

// ── Paths ─────────────────────────────────────────────────────
const BLOGS_FILE = path.join(__dirname, "blogs.json");

// Helper: read blogs.json
function readBlogs() {
  const raw = fs.readFileSync(BLOGS_FILE, "utf8");
  return JSON.parse(raw);
}

// Helper: write blogs.json
function writeBlogs(data) {
  fs.writeFileSync(BLOGS_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ══════════════════════════════════════════════════════════════
//  BLOG API
// ══════════════════════════════════════════════════════════════

// GET all published blogs + publications (for main website)
app.get("/api/blogs", (req, res) => {
  const data = readBlogs();
  res.json({
    blogs: data.blogs.filter(b => b.published),
    publications: data.publications.filter(p => p.published)
  });
});

// GET single post by id (for blog detail page)
app.get("/api/blog/:id", (req, res) => {
  const data = readBlogs();
  const all = [...data.blogs, ...data.publications];
  const post = all.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });
  res.json(post);
});

// ── Admin Auth Middleware ──────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASS || "sanwal@admin123";

function adminAuth(req, res, next) {
  const auth = req.headers["x-admin-password"];
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// POST /admin/login — verify password
app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: "Wrong password" });
  }
});

// GET all posts (admin — includes unpublished)
app.get("/admin/posts", adminAuth, (req, res) => {
  const data = readBlogs();
  res.json(data);
});

// POST — create new blog or publication
app.post("/admin/post", adminAuth, (req, res) => {
  try {
    const data = readBlogs();
    const { type, published, date, ...rest } = req.body;

    const newPost = {
      id: Date.now().toString(),
      type: type || "blog",
      published: published === true || published === "true",
      date: date || new Date().toISOString().split("T")[0],
      ...rest
    };

    if (type === "publication") {
      data.publications.unshift(newPost);
    } else {
      data.blogs.unshift(newPost);
    }

    writeBlogs(data);
    res.json({ success: true, post: newPost });
  } catch (err) {
    console.error("POST /admin/post error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT — update post
app.put("/admin/post/:id", adminAuth, (req, res) => {
  try {
    const data = readBlogs();
    const { id } = req.params;
    const updates = { ...req.body };

    // Fix boolean
    if (updates.published !== undefined) {
      updates.published = updates.published === true || updates.published === "true";
    }

    let found = false;
    ["blogs", "publications"].forEach(key => {
      const idx = data[key].findIndex(p => p.id === id);
      if (idx !== -1) {
        data[key][idx] = { ...data[key][idx], ...updates };
        found = true;
      }
    });

    if (!found) return res.status(404).json({ error: "Not found" });
    writeBlogs(data);
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /admin/post error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE — delete post
app.delete("/admin/post/:id", adminAuth, (req, res) => {
  const data = readBlogs();
  const { id } = req.params;

  data.blogs = data.blogs.filter(p => p.id !== id);
  data.publications = data.publications.filter(p => p.id !== id);

  writeBlogs(data);
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════
//  CAREER APPLICATION EMAIL
// ══════════════════════════════════════════════════════════════
app.post("/send-application", async (req, res) => {
  const { opportunity, firstName, lastName, email, phone, college, year, interest, message } = req.body;

  if (!firstName || !lastName || !email || !opportunity) {
    return res.status(400).json({ success: false, message: "Required fields missing." });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
    });

    await transporter.verify();

    const mailHTML = `
      <div style="font-family:Arial;padding:20px;background:#f5f5f5;">
        <div style="max-width:700px;margin:auto;background:#fff;padding:30px;border-radius:10px;">
          <h2 style="color:#0d1b3d;">New Career Application — Sanwal & Associates</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:12px;border:1px solid #ddd;"><b>Application Type</b></td><td style="padding:12px;border:1px solid #ddd;">${opportunity}</td></tr>
            <tr><td style="padding:12px;border:1px solid #ddd;"><b>Full Name</b></td><td style="padding:12px;border:1px solid #ddd;">${firstName} ${lastName}</td></tr>
            <tr><td style="padding:12px;border:1px solid #ddd;"><b>Email</b></td><td style="padding:12px;border:1px solid #ddd;">${email}</td></tr>
            <tr><td style="padding:12px;border:1px solid #ddd;"><b>Phone</b></td><td style="padding:12px;border:1px solid #ddd;">${phone}</td></tr>
            <tr><td style="padding:12px;border:1px solid #ddd;"><b>College</b></td><td style="padding:12px;border:1px solid #ddd;">${college}</td></tr>
            <tr><td style="padding:12px;border:1px solid #ddd;"><b>Graduation Year</b></td><td style="padding:12px;border:1px solid #ddd;">${year}</td></tr>
            <tr><td style="padding:12px;border:1px solid #ddd;"><b>Area of Interest</b></td><td style="padding:12px;border:1px solid #ddd;">${interest}</td></tr>
            <tr><td style="padding:12px;border:1px solid #ddd;"><b>Cover Note</b></td><td style="padding:12px;border:1px solid #ddd;">${message}</td></tr>
          </table>
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"Sanwal & Associates Careers" <${process.env.MAIL_USER}>`,
      to: process.env.MAIL_USER,
      replyTo: email,
      subject: `New ${opportunity} Application — ${firstName} ${lastName}`,
      html: mailHTML
    });

    res.status(200).json({ success: true, message: "Application submitted successfully" });
  } catch (error) {
    console.error("Mail error:", error);
    res.status(500).json({ success: false, message: "Failed to send email." });
  }
});

// ── Health check ───────────────────────────────────────────────
app.get("/", (req, res) => res.send("Backend Working ✅"));

app.listen(8000, () => console.log("✅ Server running on port 8000"));