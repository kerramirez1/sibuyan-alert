import express from 'express';
import { streamFile } from '../controllers/fileController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/:id/:filename?', optionalAuth, streamFile);

export default router;
