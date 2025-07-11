import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { Repository, DataSource } from 'typeorm';
import { UpdateProductStatusDto } from './dto/update-status-dto';
import { Client } from 'src/clients/entities/client.entity';
import { ProductPrintingOptions } from './entities/product-printing-options.entity';


@Injectable()
export class ProductsService {

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(ProductPrintingOptions)
    private readonly productPrintingOptionsRepo: Repository<ProductPrintingOptions>,

    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,

    private dataSource: DataSource
  ) { }

  async create(createProductDto: CreateProductDto, createdBy: string): Promise<Product> {
    try {
      const client = await this.clientRepository.findOne({ where: { Id: createProductDto.ClientId } })
      if (!client) throw new BadRequestException(`Client with ID ${createProductDto.ClientId} not found`)
      const newProduct = this.productRepository.create({
        ...createProductDto,
        CreatedBy: createdBy,
        UpdatedBy: createdBy,
      });

      const savedProduct = await this.productRepository.save(newProduct);

      if (
        (createProductDto.productColors && createProductDto.productColors.length > 0) ||
        (createProductDto.productDetails && createProductDto.productDetails.length > 0) ||
        (createProductDto.productSizes && createProductDto.productSizes.length > 0) ||
        (createProductDto.printingOptions && createProductDto.printingOptions.length > 0)
      ) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
          if (createProductDto.productColors && createProductDto.productColors.length > 0) {
            for (const color of createProductDto.productColors) {
              await queryRunner.query(
                `INSERT INTO availablecoloroptions (colorId, ProductId, ImageId, CreatedBy, UpdatedBy) 
                 VALUES (?, ?, ?, ?, ?)`,
                [
                  color.colorId,
                  savedProduct.Id,
                  color.ImageId,
                  createdBy,
                  createdBy,
                ]
              );
            }
          }

          if (createProductDto.printingOptions && createProductDto.printingOptions.length > 0) {
            for (const printingOption of createProductDto.printingOptions) {
              const newOption = queryRunner.manager.create(ProductPrintingOptions, {
                ProductId: savedProduct.Id,
                PrintingOptionId: printingOption.PrintingOptionId, // assuming you renamed it from just `Id` to be more descriptive
                CreatedBy: createdBy,
                UpdatedBy: createdBy
              });

              await queryRunner.manager.save(ProductPrintingOptions, newOption);
            }
          }

          if (createProductDto.productDetails && createProductDto.productDetails.length > 0) {
            for (const detail of createProductDto.productDetails) {
              await queryRunner.query(
                `INSERT INTO productdetails 
                (ProductId, ProductCutOptionId, CreatedBy, UpdatedBy, SleeveTypeId) 
                VALUES (?, ?, ?, ?, ?)`,
                [
                  savedProduct.Id,
                  detail.ProductCutOptionId,
                  createdBy,
                  createdBy,
                  detail.SleeveTypeId,
                ]
              );
            }
          }

          const tempListOfProduct = createProductDto.productSizes.map(e => e.sizeId)

          if (tempListOfProduct.length > 0) {
            for (const size of tempListOfProduct) {
              console.log(size);
              await queryRunner.query(
                `INSERT INTO availblesizeoptions 
                (sizeId, ProductId) 
                VALUES (?, ?)`,
                [
                  size,
                  savedProduct.Id
                ]
              );
            }
          }

          await queryRunner.commitTransaction();
        } catch (error) {
          await queryRunner.rollbackTransaction();
          throw new Error('Failed to insert color options and/or product details');
        } finally {
          await queryRunner.release();
        }
      }

      return savedProduct;
    } catch (error) {
      console.error('Error creating product:', error);
      throw new BadRequestException(error.message || 'Error creating product');
    }
  }

  async getAllProducts(): Promise<any[]> {
    try {
      const products = await this.productRepository
        .createQueryBuilder('product')
        .leftJoin('fabrictype', 'fabric', 'fabric.Id = product.FabricTypeId')
        .leftJoin('productcategory', 'category', 'category.Id = product.ProductCategoryId')
        .leftJoin('Client', 'client', 'client.Id = product.ClientId')
        .select([
          'product.Id AS Id',
          'product.Name AS Name',
          'product.ProductCategoryId AS ProductCategoryId',
          'category.Type AS ProductCategoryName',
          'product.FabricTypeId AS FabricTypeId',
          'fabric.Type AS FabricType',
          'fabric.Name AS FabricName',
          'fabric.GSM AS GSM',
          'product.Description AS Description',
          'product.productStatus AS productStatus',
          'product.isArchived AS isArchived',
          'client.Id AS ClientId',
          'client.Name AS ClientName',
          'product.CreatedOn AS CreatedOn',
          'product.UpdatedOn AS UpdatedOn',
          'product.CreatedBy AS CreatedBy',
          'product.UpdatedBy AS UpdatedBy'
        ])
        .getRawMany();
      
      return products.map(product => ({
        Id: product?.Id,
        Name: product?.Name,
        ProductCategoryId: product?.ProductCategoryId,
        ProductCategoryName: product?.ProductCategoryName,
        FabricTypeId: product?.FabricTypeId || "",
        FabricType: product?.FabricType || "",
        FabricName: product?.FabricName || "",
        GSM: product?.GSM || "",
        Description: product?.Description || "",
        productStatus: product?.productStatus || "",
        isArchived: product?.isArchived || false,
        ClientId: product?.ClientId || null,
        ClientName: product?.ClientName || null,
        CreatedBy: product?.CreatedBy || "",
        UpdatedBy: product?.UpdatedBy || "",
        CreatedOn: product?.CreatedOn || "",
        UpdatedOn: product?.UpdatedOn || ""
      }));
    } catch (error) {
      console.error("Error fetching products:", error);
      return [];
    }
  }

  async findOne(id: number): Promise<any> {
    const product = await this.productRepository.findOne({ where: { Id: id } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const printingOptions = await this.productPrintingOptionsRepo.find({
      where: { Product: { Id: product.Id } },
      relations: ['Product', 'PrintingOption']
    });

    const productColors = await this.dataSource.query(
      `SELECT * FROM availablecoloroptions WHERE ProductId = ?`,
      [id]
    );

    const productSizes = await this.dataSource.query(
      `SELECT s.Id, s.ProductId, s.sizeId, so.OptionSizeOptions AS SizeName
     FROM availblesizeoptions s
     INNER JOIN sizeoptions so ON s.sizeId = so.Id
     WHERE s.ProductId = ?`,
      [id]
    );

    const productDetails = await this.dataSource.query(
      `SELECT * FROM productdetails WHERE ProductId = ?`,
      [id]
    );

    return {
      ...product,
      printingOptions,
      productColors,
      productDetails,
      productSizes,
    };
  }

  async update(id: number, updateProductDto: UpdateProductDto, updatedBy: string): Promise<any> {
    const product = await this.productRepository.findOne({ where: { Id: id } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    let isClientIdUpdated = product.ClientId !== updateProductDto.ClientId;
    if (isClientIdUpdated) {
      const newClient = await this.clientRepository.findOne({ where: { Id: updateProductDto.ClientId } })
      if (!newClient) throw new BadRequestException(`Client with ID ${updateProductDto.ClientId} not found`)
    }

    const { productColors, productDetails, productSizes, printingOptions, ...productData } = updateProductDto;

    const updatedProduct = await this.productRepository.save({
      ...productData,
      Id: id,
      UpdatedBy: updatedBy,
      UpdatedOn: new Date(),
    });

    if (
      (productColors && Array.isArray(productColors)) ||
      (productDetails && Array.isArray(productDetails)) ||
      (productSizes && Array.isArray(productSizes)) ||
      (printingOptions && Array.isArray(printingOptions))
    ) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // ----- Update Colors -----
        if (productColors && Array.isArray(productColors)) {
          const existingColors: { Id: number }[] = await queryRunner.query(
            `SELECT Id FROM availablecoloroptions WHERE ProductId = ?`,
            [id]
          );
          const updatedColorIds = productColors.filter(c => c.Id).map(c => c.Id);
          const colorsToRemove = existingColors.filter(c => !updatedColorIds.includes(c.Id));
          if (colorsToRemove.length > 0) {
            const idsToRemove = colorsToRemove.map(c => c.Id).join(',');
            await queryRunner.query(`DELETE FROM availablecoloroptions WHERE Id IN (${idsToRemove})`);
          }
          for (const color of productColors) {
            if (color.Id) {
              await queryRunner.query(
                `UPDATE availablecoloroptions 
               SET colorId = ?, ImageId = ?, UpdatedOn = ?, UpdatedBy = ? 
               WHERE Id = ?`,
                [color.colorId, color.ImageId, new Date(), updatedBy, color.Id]
              );
            } else {
              await queryRunner.query(
                `INSERT INTO availablecoloroptions 
                (ProductId, colorId, ImageId, CreatedOn, CreatedBy, UpdatedOn, UpdatedBy) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, color.colorId, color.ImageId, new Date(), updatedBy, new Date(), updatedBy]
              );
            }
          }
        }

        // ----- Update Details -----
        if (productDetails && Array.isArray(productDetails)) {
          const existingDetails: { Id: number }[] = await queryRunner.query(
            `SELECT Id FROM productdetails WHERE ProductId = ?`,
            [id]
          );
          const updatedDetailIds = productDetails.filter(d => d.Id).map(d => d.Id);
          const detailsToRemove = existingDetails.filter(d => !updatedDetailIds.includes(d.Id));
          if (detailsToRemove.length > 0) {
            const idsToRemove = detailsToRemove.map(d => d.Id).join(',');
            await queryRunner.query(`DELETE FROM productdetails WHERE Id IN (${idsToRemove})`);
          }
          for (const detail of productDetails) {
            if (detail.Id) {
              await queryRunner.query(
                `UPDATE productdetails 
               SET ProductCutOptionId = ?, UpdatedOn = ?, UpdatedBy = ?, SleeveTypeId = ? 
               WHERE Id = ?`,
                [
                  detail.ProductCutOptionId,
                  new Date(),
                  updatedBy,
                  detail.SleeveTypeId,
                  detail.Id,
                ]
              );
            } else {
              await queryRunner.query(
                `INSERT INTO productdetails 
                (ProductId, ProductCutOptionId, CreatedOn, CreatedBy, UpdatedOn, UpdatedBy, SleeveTypeId) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  id,
                  detail.ProductCutOptionId,
                  new Date(),
                  updatedBy,
                  new Date(),
                  updatedBy,
                  detail.SleeveTypeId,
                ]
              );
            }
          }
        }

        // ----- Update Sizes -----
        if (productSizes && Array.isArray(productSizes)) {
          // Fetch existing sizes by ProductId
          const existingSizes: { Id: number, sizeId: number }[] = await queryRunner.query(
            `SELECT Id, sizeId FROM availblesizeoptions WHERE ProductId = ?`,
            [id]
          );

          const updatedSizeIds = productSizes.map(s => s.sizeId);

          // Find sizes to remove (existing but not in updated)
          const sizesToRemove = existingSizes.filter(s => !updatedSizeIds.includes(s.sizeId));
          if (sizesToRemove.length > 0) {
            const idsToRemove = sizesToRemove.map(s => s.Id).join(',');
            await queryRunner.query(`DELETE FROM availblesizeoptions WHERE Id IN (${idsToRemove})`);
          }

          // Find sizes to add (in updated but not existing)
          const existingSizeIds = existingSizes.map(s => s.sizeId);
          const sizesToAdd = productSizes.filter(s => !existingSizeIds.includes(s.sizeId));

          for (const size of sizesToAdd) {
            await queryRunner.query(
              `INSERT INTO availblesizeoptions (sizeId, ProductId) VALUES (?, ?)`,
              [size.sizeId, id]
            );
          }
        }

        if (updateProductDto.printingOptions && updateProductDto.printingOptions.length > 0) {
          const printingOptionRepo = queryRunner.manager.getRepository(ProductPrintingOptions);
          const existingOptions = await printingOptionRepo.find({
            where: { ProductId: id },
          });
          const incomingIds = updateProductDto.printingOptions.map(o => o.PrintingOptionId);
          const toRemove = existingOptions.filter(opt => !incomingIds.includes(opt.PrintingOptionId));
          if (toRemove.length > 0) {
            await printingOptionRepo.remove(toRemove);
          }
          const existingPrintingOptionIds = existingOptions.map(opt => opt.PrintingOptionId);
          const toAdd = updateProductDto.printingOptions.filter(opt => !existingPrintingOptionIds.includes(opt.PrintingOptionId));

          if (toAdd.length > 0) {
            const newPrintingOptions = toAdd.map(opt =>
              printingOptionRepo.create({
                ProductId: id,
                PrintingOptionId: opt.PrintingOptionId,
              }),
            );

            await printingOptionRepo.save(newPrintingOptions);
          }
        }

        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw new Error('Failed to update product colors, details, and sizes');
      } finally {
        await queryRunner.release();
      }
    }

    return updatedProduct;
  }

  async updateProductStatus(id: number, updateProductStatusDto: UpdateProductStatusDto, updatedBy: string): Promise<any> {
    const { isArchived } = updateProductStatusDto
    const product = await this.productRepository.findOne({ where: { Id: id } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    product.isArchived = isArchived;
    product.UpdatedBy = updatedBy;
    const updatedProduct = await this.productRepository.save(product)
    if (!updatedProduct) throw new InternalServerErrorException("Can't update status. Please try again later")
    return { message: 'Updated Successfully' }
  }

  async remove(id: number): Promise<{ message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const product = await this.productRepository.findOne({ where: { Id: id } });

      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      // Delete related available color options
      await queryRunner.query(`DELETE FROM availablecoloroptions WHERE ProductId = ?`, [id]);

      // Delete related product details
      await queryRunner.query(`DELETE FROM productdetails WHERE ProductId = ?`, [id]);

      // Delete related available size options
      await queryRunner.query(`DELETE FROM availblesizeoptions WHERE ProductId = ?`, [id]);

      await queryRunner.manager.delete(ProductPrintingOptions, { ProductId: id });

      // Delete the product itself
      await queryRunner.query(`DELETE FROM product WHERE Id = ?`, [id]);

      await queryRunner.commitTransaction();

      return { message: `Product with ID ${id} has been deleted successfully` };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(error.message || `Error deleting product with ID ${id}`);
    } finally {
      await queryRunner.release();
    }
  }


  async getAvailableColorsByProductId(productId: number): Promise<any[]> {
    try {
      const availableColors = await this.productRepository
        .createQueryBuilder('product')
        .leftJoin('availablecoloroptions', 'colors', 'colors.ProductId = product.Id')
        .leftJoin('coloroption', 'color', 'color.Id = colors.colorId')
        .select([
          'colors.Id AS Id',
          'color.Name AS ColorName',
          'color.HexCode AS HexCode',
          'colors.ImageId AS ImageId',
        ])
        .where('product.Id = :productId', { productId })
        .andWhere('colors.Id IS NOT NULL')
        .getRawMany();

      if (!availableColors || availableColors.length === 0) {
        return [];
      }

      return availableColors.map((color) => ({
        Id: color.Id,
        ColorName: color.ColorName,
        HexCode: color.HexCode,
        ImageId: color.ImageId,
      }));
    } catch (error) {
      console.error("Error fetching available colors:", error);
      return [];
    }
  }

  async getAvailableSizesByProductId(productId: number): Promise<any[]> {
    try {
      const availableSizes = await this.productRepository
        .createQueryBuilder('product')
        .leftJoin('availblesizeoptions', 'sizes', 'sizes.ProductId = product.Id')
        .leftJoin('sizeoptions', 'size', 'size.Id = sizes.sizeId')
        .select([
          'sizes.Id AS Id',
          'sizes.sizeId AS SizeId',
          'size.OptionSizeOptions AS SizeName',
        ])
        .where('product.Id = :productId', { productId })
        .andWhere('sizes.Id IS NOT NULL')
        .getRawMany();

      if (!availableSizes || availableSizes.length === 0) {
        return [];
      }

      return availableSizes.map((size) => ({
        Id: size.Id,
        SizeId: size.SizeId,
        SizeName: size.SizeName,
      }));
    } catch (error) {
      console.error("Error fetching available sizes:", error);
      return [];
    }
  }

  async getAvailableCutOptionsByProductId(productId: number): Promise<any[]> {
    try {
      const cutOptions = await this.productRepository
        .createQueryBuilder('product')
        .leftJoin('productdetails', 'details', 'details.ProductId = product.Id')
        .leftJoin('productcutoptions', 'cutOption', 'cutOption.Id = details.ProductCutOptionId')
        .select([
          'cutOption.Id AS Id',
          'cutOption.OptionProductCutOptions AS Name'
        ])
        .where('product.Id = :productId', { productId })
        .andWhere('details.Id IS NOT NULL')
        .getRawMany();

      if (!cutOptions || cutOptions.length === 0) {
        return [];
      }

      return cutOptions.map((option) => ({
        Id: option.Id,
        Name: option.Name
      }));
    } catch (error) {
      console.error("Error fetching available cut options:", error);
      throw new BadRequestException('Error fetching cut options for product');
    }
  }

  async getAvailableSleeveTypesByProductId(productId: number): Promise<any[]> {
    try {
      const sleevetypes = await this.productRepository
        .createQueryBuilder('product')
        .leftJoin('productdetails', 'details', 'details.ProductId = product.Id')
        .leftJoin('sleevetype', 'sleevetype', 'sleevetype.Id = details.SleeveTypeId ')
        .select(['DISTINCT details.SleeveTypeId ', 'sleevetype.*'])
        .where('product.Id = :productId', { productId })
        .andWhere('details.SleeveTypeId  IS NOT NULL')
        .andWhere('sleevetype.Id IS NOT NULL')
        .getRawMany();
      return sleevetypes;
    } catch (error) {
      console.error("Error fetching available Sleeve Types:", error);
      throw new BadRequestException('Error fetching sleeve types for product');
    }
  }
}
