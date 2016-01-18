DROP TABLE IF EXISTS product;

CREATE TABLE "product"
(
    id SERIAL NOT NULL,
    name character varying(20) NOT NULL,
    quantity int NOT NULL,
    CONSTRAINT product_pkey PRIMARY KEY (id)
);

INSERT INTO product(id, name, quantity) VALUES (1, 'prodA', 1);
INSERT INTO product(id, name, quantity) VALUES (2, 'prodB', 2);
INSERT INTO product(id, name, quantity) VALUES (3, 'prodC', 3);
INSERT INTO product(id, name, quantity) VALUES (4, 'prodD', 4);
INSERT INTO product(id, name, quantity) VALUES (5, 'prodAA', 1);
INSERT INTO product(id, name, quantity) VALUES (6, 'prodBB', 2);