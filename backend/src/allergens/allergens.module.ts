import { Module } from '@nestjs/common';
import { AllergenComponentRepository } from './allergen-component.repository';

@Module({
  providers: [AllergenComponentRepository],
  exports: [AllergenComponentRepository],
})
export class AllergensModule {}
