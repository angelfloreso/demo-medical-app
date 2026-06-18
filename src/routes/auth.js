'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

router.post('/register',
  body('username').isAlphanumeric().isLength({ min: 3, max: 30 }).trim().escape(),
  body('password').isStrongPassword({ minLength: 12, minNumbers: 1, minSymbols: 1 }),
  body('role').isIn(['doctor', 'nurse', 'admin']),
  validate,
  async (req, res, next) => {
    try {
      const { username, password, role } = req.body;
      const db = getDb();
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) return res.status(409).json({ error: 'Username already taken.' });

      const password_hash = await bcrypt.hash(password, 12);
      const id = uuidv4();
      db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(id, username, password_hash, role);
      logger.info({ event: 'user_registered', username, role });
      res.status(201).json({ message: 'User registered successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/login',
  body('username').isAlphanumeric().trim().escape(),
  body('password').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

      // Constant-time comparison to prevent timing attacks
      const dummyHash = '$2a$12$invalid.hash.for.timing.safety.padding.here';
      const hash = user ? user.password_hash : dummyHash;
      const valid = await bcrypt.compare(password, hash);

      if (!user || !valid) {
        logger.warn({ event: 'login_failed', username });
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      const token = jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '8h', issuer: 'demo-medical-app' }
      );
      logger.info({ event: 'login_success', username });
      res.json({ token });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
