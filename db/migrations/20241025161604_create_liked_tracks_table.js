/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async (knex) => {
    await knex.schema.createTable('liked_tracks', table => {
        table.increments('id');
        table.string('user_id').notNullable();
        table.string('track_id').notNullable().unique();
        table.string('added_at').notNullable();
        table.string('genre');
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