alter table fulfillment_order add column buyer_id varchar(64);
alter table fulfillment_order add column receiver varchar(128);
alter table fulfillment_order add column receiver_phone varchar(32);
alter table fulfillment_order add column address varchar(512);
