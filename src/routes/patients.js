'use strict';
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticate);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// List patients — doctors see only their own; admins see all
router.get('/',
  query('name').optional().isAlpha('en-US', { ignore: ' ' }).trim().escape(),
  validate,
  (req, res, next) => {
    try {
      const db = getDb();
      const { name } = req.query;
      let stmt, rows;
      if (req.user.role === 'admin') {
        stmt = name
          ? db.prepare("SELECT id, first_name, last_name, date_of_birth, diagnosis, assigned_doctor_id FROM patients WHERE first_name LIKE ? OR last_name LIKE ?")
          : db.prepare("SELECT id, first_name, last_name, date_of_birth, diagnosis, assigned_doctor_id FROM patients");
        rows = name ? stmt.all(`%${name}%`, `%${name}%`) : stmt.all();
      } else {
        stmt = name
          ? db.prepare("SELECT id, first_name, last_name, date_of_birth, diagnosis, assigned_doctor_id FROM patients WHERE assigned_doctor_id = ? AND (first_name LIKE ? OR last_name LIKE ?)")
          : db.prepare("SELECT id, first_name, last_name, date_of_birth, diagnosis, assigned_doctor_id FROM patients WHERE assigned_doctor_id = ?");
        rows = name ? stmt.all(req.user.sub, `%${name}%`, `%${name}%`) : stmt.all(req.user.sub);
      }
      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

// Get single patient — enforce ownership
router.get('/:id',
  param('id').isUUID(),
  validate,
  (req, res, next) => {
    try {
      const db = getDb();
      const patient = db.prepare('SELECT id, first_name, last_name, date_of_birth, diagnosis, assigned_doctor_id FROM patients WHERE id = ?').get(req.params.id);
      if (!patient) return res.status(404).json({ error: 'Patient not found.' });
      if (req.user.role !== 'admin' && patient.assigned_doctor_id !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      res.json(patient);
    } catch (err) {
      next(err);
    }
  }
);

// Create patient — doctors and admins only
router.post('/',
  authorize('doctor', 'admin'),
  body('first_name').isAlpha().isLength({ min: 1, max: 100 }).trim().escape(),
  body('last_name').isAlpha().isLength({ min: 1, max: 100 }).trim().escape(),
  body('date_of_birth').isISO8601().toDate(),
  body('ssn').matches(/^\d{3}-\d{2}-\d{4}$/),
  body('diagnosis').optional().isLength({ max: 500 }).trim().escape(),
  validate,
  async (req, res, next) => {
    try {
      const bcrypt = require('bcryptjs');
      const { first_name, last_name, date_of_birth, ssn, diagnosis } = req.body;
      const db = getDb();
      const id = uuidv4();
      const ssn_hash = await bcrypt.hash(ssn, 12);
      db.prepare('INSERT INTO patients (id, first_name, last_name, date_of_birth, ssn_hash, diagnosis, assigned_doctor_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, first_name, last_name, date_of_birth instanceof Date ? date_of_birth.toISOString().slice(0, 10) : date_of_birth, ssn_hash, diagnosis || null, req.user.sub);
      logger.info({ event: 'patient_created', patient_id: id, created_by: req.user.username });
      res.status(201).json({ id, message: 'Patient created successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
