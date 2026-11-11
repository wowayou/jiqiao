import { describeExhibitAudits } from '../../exhibit/testing'
import exhibit from './index'
// 时间轴一周期 12 小时；相位数取 127（与 2 s 摆周期不可公约），使采样落在擒纵的各个阶段。
// 擒纵与各对啮合的逐相位加密干涉审计见 model.test.ts。
describeExhibitAudits(exhibit, { phases: 127, timeout: 600_000 })
