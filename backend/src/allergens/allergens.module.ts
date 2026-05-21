import { Module } from '@nestjs/common';
import { AllergenComponentRepository } from './allergen-component.repository';
import { AllergensController } from './allergens.controller';
import { AllergensService } from './allergens.service';

@Module({
  controllers: [AllergensController],
  providers: [AllergenComponentRepository, AllergensService],
  exports: [AllergenComponentRepository],
})
export class AllergensModule {}
