import { Router, type IRouter } from "express";
import healthRouter from "./health";
import interviewRouter from "./interview";
import unlockRouter from "./unlock";

const router: IRouter = Router();

router.use(healthRouter);
router.use(interviewRouter);
router.use(unlockRouter);

export default router;
