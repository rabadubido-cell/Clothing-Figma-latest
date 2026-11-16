-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users (
  user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_id uuid UNIQUE,
  username character varying NOT NULL UNIQUE,
  name character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['Administrator'::character varying, 'Inventory Staff'::character varying, 'Sales Staff'::character varying, 'Procurement Staff'::character varying, 'Manager'::character varying]::text[])),
  status character varying NOT NULL DEFAULT 'Active'::character varying CHECK (status::text = ANY (ARRAY['Active'::character varying, 'Inactive'::character varying]::text[])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (user_id),
  CONSTRAINT users_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id)
);
CREATE TABLE public.categories (
  category_id integer NOT NULL DEFAULT nextval('categories_category_id_seq'::regclass),
  category_name character varying NOT NULL UNIQUE,
  description text,
  CONSTRAINT categories_pkey PRIMARY KEY (category_id)
);
CREATE TABLE public.products (
  product_id integer NOT NULL DEFAULT nextval('products_product_id_seq'::regclass),
  category_id integer NOT NULL,
  product_name character varying NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (product_id),
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id)
);
CREATE TABLE public.product_variants (
  variant_id integer NOT NULL DEFAULT nextval('product_variants_variant_id_seq'::regclass),
  product_id integer NOT NULL,
  sku character varying NOT NULL UNIQUE,
  size character varying NOT NULL,
  color character varying NOT NULL,
  price numeric NOT NULL CHECK (price >= 0::numeric),
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0::numeric),
  CONSTRAINT product_variants_pkey PRIMARY KEY (variant_id),
  CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id)
);
CREATE TABLE public.inventory (
  inventory_id integer NOT NULL DEFAULT nextval('inventory_inventory_id_seq'::regclass),
  variant_id integer NOT NULL UNIQUE,
  quantity_on_hand integer NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_point integer NOT NULL DEFAULT 10 CHECK (reorder_point >= 0),
  safety_stock integer NOT NULL DEFAULT 5 CHECK (safety_stock >= 0),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_pkey PRIMARY KEY (inventory_id),
  CONSTRAINT inventory_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(variant_id)
);
CREATE TABLE public.inventory_transactions (
  transaction_id integer NOT NULL DEFAULT nextval('inventory_transactions_transaction_id_seq'::regclass),
  variant_id integer NOT NULL,
  user_id uuid,
  transaction_type character varying NOT NULL CHECK (transaction_type::text = ANY (ARRAY['SALE'::character varying, 'CANCELLATION'::character varying, 'RETURN'::character varying, 'RECEIPT'::character varying, 'ADJUSTMENT'::character varying]::text[])),
  quantity integer NOT NULL,
  remarks text,
  transaction_date timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_transactions_pkey PRIMARY KEY (transaction_id),
  CONSTRAINT inventory_transactions_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(variant_id),
  CONSTRAINT inventory_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.sales (
  sale_id integer NOT NULL DEFAULT nextval('sales_sale_id_seq'::regclass),
  order_reference character varying NOT NULL UNIQUE,
  channel character varying NOT NULL DEFAULT 'Online Store'::character varying,
  user_id uuid,
  sale_date timestamp with time zone NOT NULL DEFAULT now(),
  total_amount numeric NOT NULL DEFAULT 0 CHECK (total_amount >= 0::numeric),
  status character varying NOT NULL DEFAULT 'Completed'::character varying CHECK (status::text = ANY (ARRAY['Completed'::character varying, 'Cancelled'::character varying, 'Returned'::character varying]::text[])),
  CONSTRAINT sales_pkey PRIMARY KEY (sale_id),
  CONSTRAINT sales_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.sale_items (
  sale_item_id integer NOT NULL DEFAULT nextval('sale_items_sale_item_id_seq'::regclass),
  sale_id integer NOT NULL,
  variant_id integer NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0::numeric),
  CONSTRAINT sale_items_pkey PRIMARY KEY (sale_item_id),
  CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(sale_id),
  CONSTRAINT sale_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(variant_id)
);
CREATE TABLE public.suppliers (
  supplier_id integer NOT NULL DEFAULT nextval('suppliers_supplier_id_seq'::regclass),
  supplier_name character varying NOT NULL,
  contact_person character varying,
  contact_details character varying NOT NULL,
  lead_time_days integer NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),
  status character varying NOT NULL DEFAULT 'Active'::character varying CHECK (status::text = ANY (ARRAY['Active'::character varying, 'Inactive'::character varying]::text[])),
  CONSTRAINT suppliers_pkey PRIMARY KEY (supplier_id)
);
CREATE TABLE public.supplier_products (
  supplier_product_id integer NOT NULL DEFAULT nextval('supplier_products_supplier_product_id_seq'::regclass),
  supplier_id integer NOT NULL,
  variant_id integer NOT NULL,
  supplier_sku character varying,
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0::numeric),
  CONSTRAINT supplier_products_pkey PRIMARY KEY (supplier_product_id),
  CONSTRAINT supplier_products_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(supplier_id),
  CONSTRAINT supplier_products_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(variant_id)
);
CREATE TABLE public.purchase_orders (
  purchase_order_id integer NOT NULL DEFAULT nextval('purchase_orders_purchase_order_id_seq'::regclass),
  po_number character varying NOT NULL UNIQUE,
  supplier_id integer NOT NULL,
  created_by uuid,
  approved_by uuid,
  order_date timestamp with time zone NOT NULL DEFAULT now(),
  status character varying NOT NULL DEFAULT 'Draft'::character varying CHECK (status::text = ANY (ARRAY['Draft'::character varying, 'Pending Approval'::character varying, 'Approved'::character varying, 'Ordered'::character varying, 'Partially Received'::character varying, 'Received'::character varying]::text[])),
  CONSTRAINT purchase_orders_pkey PRIMARY KEY (purchase_order_id),
  CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(supplier_id),
  CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id),
  CONSTRAINT purchase_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.purchase_order_items (
  po_item_id integer NOT NULL DEFAULT nextval('purchase_order_items_po_item_id_seq'::regclass),
  purchase_order_id integer NOT NULL,
  variant_id integer NOT NULL,
  quantity_ordered integer NOT NULL CHECK (quantity_ordered > 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0::numeric),
  CONSTRAINT purchase_order_items_pkey PRIMARY KEY (po_item_id),
  CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(purchase_order_id),
  CONSTRAINT purchase_order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(variant_id)
);
CREATE TABLE public.po_receipts (
  receipt_id integer NOT NULL DEFAULT nextval('po_receipts_receipt_id_seq'::regclass),
  po_item_id integer NOT NULL,
  received_by uuid,
  quantity_received integer NOT NULL CHECK (quantity_received > 0),
  received_date timestamp with time zone NOT NULL DEFAULT now(),
  status character varying NOT NULL DEFAULT 'Accepted'::character varying CHECK (status::text = ANY (ARRAY['Accepted'::character varying, 'Rejected'::character varying]::text[])),
  CONSTRAINT po_receipts_pkey PRIMARY KEY (receipt_id),
  CONSTRAINT po_receipts_po_item_id_fkey FOREIGN KEY (po_item_id) REFERENCES public.purchase_order_items(po_item_id),
  CONSTRAINT po_receipts_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(user_id)
);