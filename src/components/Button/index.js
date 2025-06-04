import React from 'react';
import PropTypes from 'prop-types';
import './styles.css';

const Button = ({
  children,
  type = 'button',
  priority = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  disabled = false,
  onClick,
  className,
  ...props
}) => {
  const getButtonClasses = () => {
    const classes = ['custom-button'];
    classes.push(`custom-button-${priority}`);
    classes.push(`custom-button-${size}`);
    if (disabled) classes.push('custom-button-disabled');
    if (className) classes.push(className);
    return classes.join(' ');
  };

  return (
    <button
      type={type}
      className={getButtonClasses()}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {icon && iconPosition === 'left' && (
        <span className="button-icon button-icon-left">{icon}</span>
      )}
      <span className="button-content">{children}</span>
      {icon && iconPosition === 'right' && (
        <span className="button-icon button-icon-right">{icon}</span>
      )}
    </button>
  );
};

Button.propTypes = {
  children: PropTypes.node.isRequired,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  priority: PropTypes.oneOf(['default', 'primary', 'secondary', 'tertiary', 'danger']),
  size: PropTypes.oneOf(['xs', 'sm', 'md']),
  icon: PropTypes.node,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
  className: PropTypes.string,
};

export default Button;
