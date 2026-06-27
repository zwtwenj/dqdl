export class CreateItemDto {
  item_id: string;
  name: string;
  type: string;
  icon?: string | null;
  price?: number;
  description?: string;
  usable?: boolean;
  use_effect?: string;
}
