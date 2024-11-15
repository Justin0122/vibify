/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
    await knex.schema.createTable('liked_tracks', table => {
        table.increments('id');
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users');
        table.integer('track_id').unsigned().notNullable().references('id').inTable('tracks');
        table.string('added_at').notNullable();
        table.integer('year').notNullable();
        table.integer('month').notNullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async (knex) => {
    await knex.schema.dropTable('liked_tracks');
};