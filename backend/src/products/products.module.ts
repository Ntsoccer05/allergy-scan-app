import { Module } from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [ProductsController],
  providers: [ProductRepository, ProductsService],
  exports: [ProductRepository],
})
export class ProductsModule {}
