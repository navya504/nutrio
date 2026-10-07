import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nutrioRouter from "./nutrio";
import membersRouter from "./members";
import staffRouter from "./staff";
import newsletterRouter from "./newsletter";
import engagementRouter from "./engagement";

const router: IRouter = Router();

router.use(healthRouter);
router.use(newsletterRouter);
router.use(nutrioRouter);
router.use(membersRouter);
router.use(staffRouter);
router.use(engagementRouter);

export default router;
