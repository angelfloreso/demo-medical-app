'use strict';
const express = require('express');
const { body, param, validationResult } = require('express-validator');
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

router.get('/patient/:patientId',
  param('patientId').isUUID(),
  validate,
  (req, res, next) => {
    try {
      const db = getDb();
      const patient = db.prepare('SELECT assigned_doctor_id FROM patients WHERE id = ?').get(req.params.patientId);
      if (!patient) return res.status(404).json({ error: 'Patient not found.' });
      if (req.user.role !== 'admin' && patient.assigned_doctor_id !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const prescriptions = db.prepare('SELECT * FROM prescriptions WHERE patient_id = ?').all(req.params.patientId);
      res.json(prescriptions);
    } catch (err) {
      next(err);
    }
  }
);

router.post('/',
  authorize('doctor', 'admin'),
  body('patient_id').isUUID(),
  body('medication').isLength({ min: 1, max: 200 }).trim().escape(),
  body('dosage').isLength({ min: 1, max: 100 }).trim().escape(),
  validate,
  (req, res, next) => {
    try {
      const { patient_id, medication, dosage } = req.body;
      const db = getDb();
      const patient = db.prepare('SELECT assigned_doctor_id FROM patients WHERE id = ?').get(patient_id);
      if (!patient) return res.status(404).json({ error: 'Patient not found.' });
      if (req.user.role !== 'admin' && patient.assigned_doctor_id !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      const id = uuidv4();
      db.prepare('INSERT INTO prescriptions (id, patient_id, doctor_id, medication, dosage) VALUES (?, ?, ?, ?, ?)')
        .run(id, patient_id, req.user.sub, medication, dosage);
      logger.info({ event: 'prescription_issued', prescription_id: id, doctor: req.user.username });
      res.status(201).json({ id, message: 'Prescription issued.' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
