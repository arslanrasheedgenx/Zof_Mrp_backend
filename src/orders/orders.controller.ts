import {
  Get,
  Post,
  Param,
  Body,
  Put,
  Delete,
  Req,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-orders.dto';
import { UpdateOrderDto } from './dto/update-orders.dto';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { CommonApiResponses } from 'src/common/decorators/common-api-response.decorator';
import { ControllerAuthProtector } from 'src/common/decorators/controller-auth-protector';
import { ApiBody } from '@nestjs/swagger';
import { OrderStatusLogs } from './entities/order-status-log';

@ControllerAuthProtector('Orders', 'orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiBody({ type: CreateOrderDto })
  @HttpCode(HttpStatus.CREATED)
  @CommonApiResponses('Create a new order')
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() currentUser: any,
  ): Promise<any> {
    try {
      return this.ordersService.createOrder(createOrderDto, currentUser.email);
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @CommonApiResponses('Get all orders')
  async findAll(): Promise<any> {
    try {
      return this.ordersService.getAllOrders();
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @CommonApiResponses('Get an order by client id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<any> {
    try {
      return this.ordersService.getOrdersByClientId(id);
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
  }

  @Put(':id')
  @ApiBody({ type: CreateOrderDto })
  @HttpCode(HttpStatus.OK)
  @CommonApiResponses('Update an order by id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @Req() req,
  ): Promise<any> {
    try {
      const userId = req.user.id;
      return this.ordersService.updateOrder(id, updateOrderDto, userId);
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  }

  @Post(':id/reorder')
@HttpCode(HttpStatus.CREATED)
@CommonApiResponses('Reorders an existing order by ID')
async reorderOrder(
  @Param('id', ParseIntPipe) id: number,
  @CurrentUser() currentUser: any
): Promise<any> {
  return this.ordersService.reorder(id, currentUser.email);
}


  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CommonApiResponses('Delete an order by id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    try {
      return this.ordersService.deleteOrder(id);
    } catch (error) {
      console.error('Error deleting order:', error);
      throw error;
    }
  }

  @Get('order-status-log/:id')
  @HttpCode(HttpStatus.OK)
  @CommonApiResponses('Get order status log by order id')
  async getOrderStatusLog(
    @Param('id', ParseIntPipe) orderId: number,
  ): Promise<Omit<OrderStatusLogs, 'Id' | 'UpdatedOn'>[]> {
    try {
      return this.ordersService.getOrderStatusLog(orderId);
    } catch (error) {
      console.error('Error fetching order status logs:', error);
      throw error;
    }
  }

  @Get('items/:id')
  @HttpCode(HttpStatus.OK)
  @CommonApiResponses('Get order items by order id')
  async getOrderItems(
    @Param('id', ParseIntPipe) orderId: number,
  ): Promise<any> {
    try {
      return this.ordersService.getOrderItemsByOrderId(orderId);
    } catch (error) {
      console.error('Error fetching order items:', error);
      throw error;
    }
  }

  @Get('get-edit/:id')
  @HttpCode(HttpStatus.OK)
  @CommonApiResponses('Get edit order by id')
  async getOrdersEdit(
    @Param('id', ParseIntPipe) orderId: number,
  ): Promise<any> {
    try {
      return this.ordersService.getEditOrder(orderId);
    } catch (error) {
      console.error('Error fetching edit order:', error);
      throw error;
    }
  }

  @Post('change-status:id/:statusId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CommonApiResponses('Update order status by id using DELETE route')
  async updateStatusViaDelete(
    @Param('id', ParseIntPipe) id: number,
    @Param('statusId', ParseIntPipe) statusId: number,
  ): Promise<void> {
    try {
      await this.ordersService.updateOrderStatus(id, statusId);
    } catch (error) {
      console.error('Error updating order status via DELETE route:', error);
      throw error;
    }
  }
}
