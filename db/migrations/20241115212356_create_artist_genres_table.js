/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
    await knex.schema.createTable('artist_genres', table => {
        table.increments('id');
        table.integer('artist_id').unsigned().notNullable().references('id').inTable('artists').onDelete('CASCADE');
        table.integer('genre_id').unsigned().notNullable().references('id').inTable('genres').onDelete('CASCADE');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
    await knex.schema.dropTable('artist_genres');
};