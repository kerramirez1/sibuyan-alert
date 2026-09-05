import express from 'express';
import {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getUnreadCount,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';
import { validateMongoIdParam } from '../middleware/validate.js';

const router = express.Router();

// All notification routes require authentication
router.use(protect);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', validateMongoIdParam, markAsRead);
router.delete('/:id', validateMongoIdParam, deleteNotification);

export default router;
