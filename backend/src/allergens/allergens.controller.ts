import { Controller, Get } from '@nestjs/common';
import { AllergensService } from './allergens.service';
import { Public } from '../auth/public.decorator';

@Controller('allergens')
export class AllergensController {
  constructor(private readonly allergensService: AllergensService) {}

  @Public()
  @Get()
  getAll() {
    return this.allergensService.getGrouped();
  }
}
