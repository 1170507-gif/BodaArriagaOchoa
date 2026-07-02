import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Enable CORS for all incoming requests (crucial for iframe preview support on some browsers)
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,content-type,Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Serve uploaded wedding video with support for Range requests
  app.get("/video/wedding.mp4", (req, res) => {
    const filePath = path.join(process.cwd(), "wedding_video.mp4");
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send("No video uploaded yet. Please upload one via the admin panel.");
    }
  });

  // Serve uploaded wedding audio with support for Range requests
  app.get("/audio/wedding.mp3", (req, res) => {
    const filePath = path.join(process.cwd(), "wedding_audio.mp3");
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send("No audio uploaded yet. Please upload one via the admin panel.");
    }
  });

  // Upload video endpoint
  // Streams the raw binary directly to disk to avoid buffering and out-of-memory errors
  app.post(
    "/api/upload-video",
    (req, res) => {
      try {
        const filePath = path.join(process.cwd(), "wedding_video.mp4");
        console.log(`Starting chunk-by-chunk streaming upload of video to ${filePath}`);
        
        const writeStream = fs.createWriteStream(filePath);
        req.pipe(writeStream);
        
        req.on("error", (err) => {
          console.error("Request stream error:", err);
          res.status(500).json({ error: "Failed to receive video stream" });
        });
        
        writeStream.on("error", (err) => {
          console.error("Write stream error:", err);
          res.status(500).json({ error: "Failed to write video file to disk" });
        });
        
        writeStream.on("finish", () => {
          console.log(`Video upload completed successfully. Size on disk: ${fs.statSync(filePath).size} bytes`);
          res.json({ success: true, url: "/video/wedding.mp4" });
        });
      } catch (error) {
        console.error("Upload handler initialization error:", error);
        res.status(500).json({ error: "Upload failed to start" });
      }
    }
  );

  // Upload audio endpoint
  // Streams the raw binary directly to disk to avoid buffering and out-of-memory errors
  app.post(
    "/api/upload-audio",
    (req, res) => {
      try {
        const filePath = path.join(process.cwd(), "wedding_audio.mp3");
        console.log(`Starting chunk-by-chunk streaming upload of audio to ${filePath}`);
        
        const writeStream = fs.createWriteStream(filePath);
        req.pipe(writeStream);
        
        req.on("error", (err) => {
          console.error("Request stream error:", err);
          res.status(500).json({ error: "Failed to receive audio stream" });
        });
        
        writeStream.on("error", (err) => {
          console.error("Write stream error:", err);
          res.status(500).json({ error: "Failed to write audio file to disk" });
        });
        
        writeStream.on("finish", () => {
          console.log(`Audio upload completed successfully. Size on disk: ${fs.statSync(filePath).size} bytes`);
          res.json({ success: true, url: "/audio/wedding.mp3" });
        });
      } catch (error) {
        console.error("Upload handler initialization error:", error);
        res.status(500).json({ error: "Upload failed to start" });
      }
    }
  );

  // Check if server-side video exists
  app.get("/api/video-status", (req, res) => {
    const filePath = path.join(process.cwd(), "wedding_video.mp4");
    res.json({ exists: fs.existsSync(filePath) });
  });

  // Check if server-side audio exists
  app.get("/api/audio-status", (req, res) => {
    const filePath = path.join(process.cwd(), "wedding_audio.mp3");
    res.json({ exists: fs.existsSync(filePath) });
  });

  // Check if original .webp files exist (scans the directory dynamically to support any number of images)
  app.get("/api/images-status", (req, res) => {
    try {
      const uploadImagesDir = path.join(process.cwd(), "public", "images");
      if (!fs.existsSync(uploadImagesDir)) {
        fs.mkdirSync(uploadImagesDir, { recursive: true });
      }
      
      const files = fs.readdirSync(uploadImagesDir);
      const status: Record<string, boolean> = {};
      
      // Always guarantee keys for 1 to 4 are present so the UI has them by default
      for (let i = 1; i <= 4; i++) {
        status[`invitacion_${i}`] = fs.existsSync(path.join(uploadImagesDir, `invitacion_${i}.webp`));
      }
      
      // Dynamic keys scanned from the directory
      files.forEach((file) => {
        const match = file.match(/^invitacion_(\d+)\.webp$/);
        if (match) {
          const num = parseInt(match[1], 10);
          status[`invitacion_${num}`] = true;
        }
      });
      
      res.json(status);
    } catch (err) {
      console.error("Error reading images directory:", err);
      res.status(500).json({ error: "Failed to scan images" });
    }
  });

  // Create public/images directory if it doesn't exist
  const uploadImagesDir = path.join(process.cwd(), "public", "images");
  if (!fs.existsSync(uploadImagesDir)) {
    fs.mkdirSync(uploadImagesDir, { recursive: true });
  }

  // Serve uploaded images (fallback for static or dynamic routes)
  app.get("/images/:filename", (req, res) => {
    const filename = req.params.filename;
    // Prevent directory traversal attacks
    const safeFilename = path.basename(filename);
    const filePath = path.join(uploadImagesDir, safeFilename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send("Image not found");
    }
  });

  // Upload image endpoint
  // Supports up to 25MB for high quality images/PNGs
  app.post(
    "/api/upload-image",
    express.raw({ type: "image/*", limit: "25mb" }),
    (req, res) => {
      try {
        const imageType = req.query.type as string; // e.g. floralDivider, countdownHeader, detailsHeader, rsvpHeader, portrait, overlayCenter, etc.
        const contentType = req.headers["content-type"] || "image/png";
        
        if (!imageType) {
          res.status(400).json({ error: "Missing 'type' query parameter" });
          return;
        }

        // Determine extension
        let ext = "png";
        if (contentType.includes("jpeg") || contentType.includes("jpg")) {
          ext = "jpg";
        } else if (contentType.includes("webp")) {
          ext = "webp";
        } else if (contentType.includes("gif")) {
          ext = "gif";
        }

        const safeType = path.basename(imageType);
        const filename = `${safeType}.${ext}`;
        const filePath = path.join(uploadImagesDir, filename);

        console.log(`Saving raw image upload of size ${req.body.length} bytes to ${filePath}`);

        if (!req.body || req.body.length === 0) {
          res.status(400).json({ error: "Empty request body" });
          return;
        }

        fs.writeFileSync(filePath, req.body);
        res.json({ success: true, url: `/images/${filename}` });
      } catch (error) {
        console.error("Upload image error:", error);
        res.status(500).json({ error: "Failed to save image file" });
      }
    }
  );

  // Delete image endpoint
  app.post("/api/delete-image", (req, res) => {
    try {
      const imageType = req.query.type as string; // e.g. invitacion_1, etc.
      if (!imageType) {
        res.status(400).json({ error: "Missing 'type' query parameter" });
        return;
      }

      const safeType = path.basename(imageType);
      const filename = `${safeType}.webp`;
      const filePath = path.join(uploadImagesDir, filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted image file: ${filePath}`);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Image not found on server" });
      }
    } catch (error) {
      console.error("Delete image error:", error);
      res.status(500).json({ error: "Failed to delete image file" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
