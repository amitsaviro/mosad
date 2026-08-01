"""remove clubhouse from activity location

Revision ID: f7bf1ab98fe5
Revises: 7d46f36ee026
Create Date: 2026-08-01 18:56:26.531973

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f7bf1ab98fe5'
down_revision: Union[str, Sequence[str], None] = '7d46f36ee026'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


old_enum = postgresql.ENUM(
    'outdoor', 'indoor_room', 'sports_hall', 'classroom', 'clubhouse',
    'dining_hall', 'field_trip', 'other',
    name='activitylocation',
)
new_enum = postgresql.ENUM(
    'outdoor', 'indoor_room', 'sports_hall', 'classroom',
    'dining_hall', 'field_trip', 'other',
    name='activitylocation',
)


def upgrade() -> None:
    """Upgrade schema."""
    # Postgres can't drop an enum value directly -- swap in a new type
    # that omits 'clubhouse', clearing any rows that used it first.
    op.execute("UPDATE activities SET location = NULL WHERE location = 'clubhouse'")
    op.execute("ALTER TYPE activitylocation RENAME TO activitylocation_old")
    new_enum.create(op.get_bind(), checkfirst=True)
    op.alter_column(
        'activities', 'location',
        existing_type=old_enum,
        type_=new_enum,
        postgresql_using='location::text::activitylocation',
        existing_nullable=True,
    )
    op.execute("DROP TYPE activitylocation_old")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TYPE activitylocation RENAME TO activitylocation_new")
    old_enum.create(op.get_bind(), checkfirst=True)
    op.alter_column(
        'activities', 'location',
        existing_type=new_enum,
        type_=old_enum,
        postgresql_using='location::text::activitylocation',
        existing_nullable=True,
    )
    op.execute("DROP TYPE activitylocation_new")
