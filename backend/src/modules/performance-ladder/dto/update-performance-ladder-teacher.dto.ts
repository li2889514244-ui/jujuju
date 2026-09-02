import { PartialType } from '@nestjs/swagger'
import { CreatePerformanceLadderTeacherDto } from './create-performance-ladder-teacher.dto'

export class UpdatePerformanceLadderTeacherDto extends PartialType(CreatePerformanceLadderTeacherDto) {}
