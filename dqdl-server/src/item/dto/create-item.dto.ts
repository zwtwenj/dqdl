export class CreateItemDto {
  item_id: string;
  name: string;
  type: string;
  price?: number;
  description?: string;
  usable?: boolean;
  use_effect?: string;
}
