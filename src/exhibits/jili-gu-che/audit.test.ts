import { describeExhibitAudits } from '../../exhibit/testing'
import exhibit from './index'

// 相位数取质数 61：周期是足轮 3000 周，若采样数整除 3000，每个采样点的齿相位都相同（混叠）。
// 61 个采样点在各级啮合周期内的相位是散开的；逐级加密的干涉审计见 model.test.ts。
describeExhibitAudits(exhibit, { phases: 61, timeout: 600_000 })
